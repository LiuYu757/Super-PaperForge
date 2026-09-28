import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { sendEmail } from '@/lib/email';
import { assertProjectRole } from '@/services/project-service';
import { recordActivationEvent } from '@/services/activation-service';
import { emailTemplate, buttonHtml, escapeHtml } from '@/lib/email-templates';
import { getAppBaseUrl } from '@/lib/app-url';
import {
  canAddProjectCollaborator,
  collaboratorLimitMessage,
  getEntitledPlan,
} from '@/lib/entitlements';

async function assertCollaboratorEntitlement(projectId: string, ownerId: string) {
  const [owner, memberCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { settings: true, storageQuotaBytes: true },
    }),
    prisma.projectMember.count({ where: { projectId } }),
  ]);
  if (!owner) throw new ApiError(404, 'Project owner not found', 'OWNER_NOT_FOUND');

  const plan = getEntitledPlan(owner);
  if (!canAddProjectCollaborator(plan, memberCount)) {
    throw new ApiError(
      402,
      collaboratorLimitMessage(plan) ?? 'Collaborator limit reached.',
      'PLAN_COLLABORATOR_LIMIT_REACHED',
    );
  }
}

export async function inviteMember(
  projectId: string,
  inviterId: string,
  email: string,
  role: 'editor' | 'viewer',
) {
  await assertProjectRole(projectId, inviterId, ['owner']);

  const invitee = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });
  if (!invitee) {
    // Return a generic success to prevent email enumeration.
    // In production, consider sending an invitation email to unregistered addresses.
    return { invited: true, message: 'If an account with that email exists, the invitation has been sent.' };
  }

  await assertCollaboratorEntitlement(projectId, inviterId);

  // Race-safe insert: rely on the (projectId, userId) unique constraint
  // rather than check-then-create. Two concurrent invites for the same
  // user previously could both pass the existence check and double-insert.
  let member;
  try {
    member = await prisma.projectMember.create({
      data: { projectId, userId: invitee.id, role },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
  } catch (err) {
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
      throw new ApiError(409, 'User is already a member of this project');
    }
    throw err;
  }

  // Persisted activation marker (the inviter validated the collaboration flow).
  recordActivationEvent(inviterId, 'invited_collaborator').catch(() => {});

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { name: true },
  });

  const appUrl = getAppBaseUrl();
  const projectName = escapeHtml(project?.name ?? 'a project');
  const inviteeName = escapeHtml(invitee.name ?? 'there');
  const projectUrl = `${appUrl}/editor/${projectId}`;
  const body = `
    <p style="margin:0 0 12px;color:#3f3f46">Hi ${inviteeName},</p>
    <p style="margin:0 0 12px;color:#3f3f46">You have been added as a <strong>${role}</strong> to the project <strong>${projectName}</strong> on PaperForge.</p>
    ${buttonHtml('Open Project', projectUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#71717a">If you believe this was sent in error, you can ignore this email.</p>
  `;
  // Fire-and-forget to normalize response timing (prevents timing side-channel
  // that could reveal whether the invitee has a registered account)
  sendEmail(
    email,
    `You've been invited to "${project?.name ?? 'a project'}" on PaperForge`,
    emailTemplate(`You've been added to "${projectName}"`, body),
  ).catch((err) => console.error('[member-service] Failed to send invitation email:', err));

  return member;
}

export async function updateMemberRole(
  projectId: string,
  requesterId: string,
  targetUserId: string,
  role: 'editor' | 'viewer',
) {
  await assertProjectRole(projectId, requesterId, ['owner']);

  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!target) throw new ApiError(404, 'Member not found');
  if (target.role === 'owner') throw new ApiError(400, 'Cannot change the owner\'s role');

  return prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId: targetUserId } },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
}

export async function removeMember(
  projectId: string,
  requesterId: string,
  targetUserId: string,
) {
  await assertProjectRole(projectId, requesterId, ['owner']);

  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!target) throw new ApiError(404, 'Member not found');
  if (target.role === 'owner') throw new ApiError(400, 'Cannot remove the project owner');

  return prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
}

export async function getMembers(projectId: string, requesterId: string) {
  await assertProjectRole(projectId, requesterId, ['owner', 'editor', 'viewer']);

  return prisma.projectMember.findMany({
    where: { projectId },
    select: {
      projectId: true,
      userId: true,
      role: true,
      joinedAt: true,
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });
}

export async function createShareLink(
  projectId: string,
  requesterId: string,
  permission: 'editor' | 'viewer',
  expiresAt?: Date,
) {
  await assertProjectRole(projectId, requesterId, ['owner']);

  const token = crypto.randomBytes(32).toString('hex');

  const link = await prisma.shareLink.create({
    data: { projectId, token, permission, expiresAt: expiresAt ?? null },
  });

  return link;
}

export async function listShareLinks(projectId: string, requesterId: string) {
  await assertProjectRole(projectId, requesterId, ['owner']);

  return prisma.shareLink.findMany({
    where: {
      projectId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      token: true,
      permission: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeShareLink(
  projectId: string,
  requesterId: string,
  linkId: string,
) {
  await assertProjectRole(projectId, requesterId, ['owner']);

  const result = await prisma.shareLink.deleteMany({
    where: { id: linkId, projectId },
  });
  if (result.count === 0) throw new ApiError(404, 'Share link not found');

  return { revoked: true };
}

export async function joinViaShareLink(token: string, userId: string) {
  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) throw new ApiError(404, 'Share link not found');
  if (link.expiresAt && link.expiresAt < new Date()) {
    throw new ApiError(410, 'Share link has expired');
  }

  // Reject links that point at a deleted/archived project up-front instead
  // of returning a null project to the caller. 410 conveys "the resource
  // this link references is gone" more clearly than 404.
  const project = await prisma.project.findFirst({
    where: { id: link.projectId, deletedAt: null },
  });
  if (!project) throw new ApiError(410, 'The project this link references is no longer available');

  const existingMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: link.projectId, userId } },
    select: { userId: true },
  });
  if (!existingMember) {
    const owner = await prisma.projectMember.findFirst({
      where: { projectId: link.projectId, role: 'owner' },
      select: { userId: true },
    });
    if (!owner) throw new ApiError(409, 'Project owner not found', 'OWNER_NOT_FOUND');
    await assertCollaboratorEntitlement(link.projectId, owner.userId);
  }

  // Race-safe insert via unique constraint catch instead of check-then-create.
  try {
    await prisma.projectMember.create({
      data: { projectId: link.projectId, userId, role: link.permission },
    });
  } catch (err) {
    // P2002 = already a member; idempotent join, just return the project.
    if (!err || typeof err !== 'object' || (err as { code?: string }).code !== 'P2002') {
      throw err;
    }
  }

  return project;
}
