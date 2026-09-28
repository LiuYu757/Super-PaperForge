import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { ApiError } from '@/lib/errors';
import {
  canCreateProjectForPlan,
  getNextUpgradePlan,
  resolveBillingPlanForUser,
} from '@/lib/billing-plans';
import { syncUserStorageUsed } from '@/lib/storage';
import { recordActivationEvent } from '@/services/activation-service';
import { applyDocumentMutationsInTx, type TextMutation } from '@/services/document-mutation-service';
import { stageBinaryBlob } from '@/services/file-service';

async function assertProjectCreationAllowed(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      settings: true,
      storageQuotaBytes: true,
    },
  });
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  const plan = resolveBillingPlanForUser(user);
  if (plan.projectLimit === null) return;

  const ownedProjectCount = await prisma.project.count({
    where: {
      deletedAt: null,
      members: { some: { userId, role: 'owner' } },
    },
  });

  if (!canCreateProjectForPlan(plan, ownedProjectCount)) {
    const upgrade = getNextUpgradePlan(plan.id);
    throw new ApiError(
      402,
      `${plan.name} includes ${plan.projectLimit} active owned projects. ${upgrade ? `Upgrade to ${upgrade.name} for unlimited projects.` : 'Contact sales to raise this limit.'}`,
      'PLAN_LIMIT_REACHED',
    );
  }
}

export async function createProject(
  userId: string,
  data: { name: string; description?: string; compiler?: string },
) {
  await assertProjectCreationAllowed(userId);

  const project = await prisma.project.create({
    data: {
      createdBy: userId,
      name: data.name,
      description: data.description,
      compiler: data.compiler || 'pdflatex',
      members: { create: { userId, role: 'owner' } },
    },
  });
  // Persisted activation marker (first project). Fire-and-forget and idempotent
  // so it never blocks or fails project creation.
  recordActivationEvent(userId, 'created_project').catch(() => {});
  return project;
}

/** New-project text imports are one transaction, including membership and quota. */
export async function createProjectWithTextFiles(
  userId: string,
  data: { name: string; description?: string; compiler?: string },
  files: Array<{ path: string; content: string }>,
) {
  return createProjectWithFiles(userId, data, files);
}

export async function createProjectWithFiles(
  userId: string,
  data: { name: string; description?: string; compiler?: string },
  files: Array<{ path: string; content: string } | { path: string; bytes: Buffer; mimeType: string }>,
) {
  if (files.length === 0) throw new ApiError(400, 'No importable files', 'EMPTY_IMPORT');
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new ApiError(400, 'Duplicate file paths in import', 'DUPLICATE_PATH');
  }
  await assertProjectCreationAllowed(userId);
  const projectId = crypto.randomUUID();
  const mutations: TextMutation[] = [];
  const cleanup: Array<() => Promise<void>> = [];
  try {
    for (const file of files) {
      if ('bytes' in file) {
        const staged = await stageBinaryBlob(projectId, file.bytes);
        cleanup.push(staged.cleanup);
        mutations.push({ kind: 'upsertBinary', path: file.path,
          minioKey: staged.minioKey, content: staged.dbContent,
          sizeBytes: file.bytes.length, mimeType: file.mimeType });
      } else {
        mutations.push({ kind: 'upsertText', path: file.path, content: file.content });
      }
    }
    const project = await prisma.$transaction(async (tx) => {
      await tx.project.create({ data: {
        id: projectId, createdBy: userId, name: data.name, description: data.description,
        compiler: data.compiler || 'pdflatex',
        members: { create: { userId, role: 'owner' } },
      } });
      await applyDocumentMutationsInTx(tx, { projectId, actorId: userId, mutations });
      return tx.project.findUniqueOrThrow({ where: { id: projectId } });
    });
    recordActivationEvent(userId, 'created_project').catch(() => {});
    return project;
  } catch (error) {
    await Promise.all(cleanup.map((remove) => remove()));
    throw error;
  }
}

export async function listProjects(userId: string, limit = 200) {
  return prisma.project.findMany({
    where: { deletedAt: null, members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      description: true,
      compiler: true,
      mainFile: true,
      revision: true,
      archived: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          projectId: true,
          userId: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        take: 10, // Limit members per project to avoid large payloads
      },
      _count: { select: { files: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

/** Cap the number of files returned with a single project payload so a
 *  pathological project (10k+ files) cannot blow up the response. */
const MAX_PROJECT_FILES_IN_RESPONSE = 1000;

export async function getProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null, members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      description: true,
      compiler: true,
      mainFile: true,
      revision: true,
      archived: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          projectId: true,
          userId: true,
          role: true,
          joinedAt: true,
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
      files: {
        where: { deletedAt: null },
        orderBy: { path: 'asc' },
        take: MAX_PROJECT_FILES_IN_RESPONSE,
        select: {
          id: true,
          path: true,
          isBinary: true,
          sizeBytes: true,
          mimeType: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!project) throw new ApiError(404, 'Project not found');
  return project;
}

export async function updateProject(
  projectId: string,
  userId: string,
  data: {
    name?: string;
    description?: string;
    compiler?: string;
    mainFile?: string;
    archived?: boolean;
  },
) {
  await assertProjectRole(projectId, userId, ['owner', 'editor']);
  return prisma.$transaction(async (tx) => {
    const compileInputChanged = data.compiler !== undefined || data.mainFile !== undefined;
    const updated = await tx.project.update({
      where: { id: projectId, deletedAt: null },
      data: { ...data, ...(compileInputChanged ? { revision: { increment: BigInt(1) } } : {}) },
    });
    if (compileInputChanged) {
      await tx.auditLog.create({ data: {
        adminId: userId, action: 'project.compile_input_updated',
        targetType: 'project', targetId: projectId,
        details: { revision: updated.revision.toString(), fields: Object.keys(data) },
      } });
    }
    return updated;
  });
}

export async function deleteProject(projectId: string, userId: string) {
  await assertProjectRole(projectId, userId, ['owner']);
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
    select: { id: true, name: true, deletedAt: true },
  });
  await syncUserStorageUsed(userId);
  // Soft-deletes are reversible by direct DB access only; an audit trail
  // makes the action recoverable and answers "who deleted X?" later.
  try {
    const { logAuditAction } = await import('@/services/audit-service');
    await logAuditAction(userId, 'project.soft_delete', 'project', projectId, {
      projectName: updated.name,
    });
  } catch (err) {
    // Never fail the user-visible delete because of a logging hiccup.
    console.error('[project-service] audit log failed for delete:', err);
  }
  return updated;
}

export async function assertProjectRole(
  projectId: string,
  userId: string,
  roles: string[],
) {
  // Join against the project to also enforce soft-delete: members of a deleted
  // project must not be able to read or mutate it via direct API calls.
  const member = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
      project: { deletedAt: null },
    },
  });
  if (!member || !roles.includes(member.role)) {
    throw new ApiError(403, 'Insufficient permissions');
  }
  return member;
}
