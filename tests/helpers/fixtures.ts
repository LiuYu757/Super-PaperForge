/**
 * Fixtures for the real-database acceptance suite.
 *
 * Everything here writes through the application's own Prisma client (which
 * resolves the pg adapter for the local test database), so the fixtures and
 * the code under test share one schema and one connection convention.
 */
import { prisma } from '@/lib/prisma';
import { sha256Sync, putTextToMinio } from './test-infra';

let userSeq = 0;
let projectSeq = 0;

/** A fresh user with a matching membership row for the given project. */
export async function fixtureUser(name = 'acceptance') {
  userSeq += 1;
  const email = `acceptance-${Date.now()}-${userSeq}@test.local`;
  return prisma.user.create({
    data: {
      email,
      name: `${name} ${userSeq}`,
      passwordHash: null,
    },
    select: { id: true, email: true },
  });
}

/** A fresh project owned by `userId`, seeded with `main.tex`. */
export async function fixtureProject(userId: string) {
  projectSeq += 1;
  return prisma.project.create({
    data: {
      createdBy: userId,
      name: `Acceptance project ${projectSeq}`,
      mainFile: 'main.tex',
      compiler: 'pdflatex',
      members: { create: { userId, role: 'owner' } },
    },
    select: { id: true, revision: true, mainFile: true, compiler: true },
  });
}

/**
 * Write a text file the way the pre-PR-1 application did: MinIO holds the
 * authoritative copy under the mutable key AND the DB `content` column mirrors
 * the same bytes. This is exactly the state that made R02 observable (apply
 * changes DB but not MinIO → reads fall back to the stale object).
 */
export async function fixtureTextFileDualStore(
  projectId: string,
  path: string,
  content: string,
) {
  const bytes = Buffer.byteLength(content, 'utf-8');
  const file = await prisma.file.create({
    data: {
      projectId,
      path,
      isBinary: false,
      sizeBytes: BigInt(bytes),
      mimeType: path.endsWith('.tex') ? 'text/x-tex' : 'text/plain',
      minioKey: `projects/${projectId}/files/${path}`,
      content,
    },
    select: { id: true, path: true },
  });
  const minioKey = `projects/${projectId}/files/${path}`;
  // Mirror the bytes to MinIO like the legacy write path did.
  await putTextToMinio(minioKey, content);
  return { file, minioKey, sha256: sha256Sync(content) };
}

/** Current revision of a project. */
export async function fixtureRevision(projectId: string): Promise<bigint> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { revision: true },
  });
  return project.revision;
}

/** Current row of a text file, or null. */
export async function fixtureFileRow(projectId: string, path: string) {
  return prisma.file.findFirst({
    where: { projectId, path, deletedAt: null },
  });
}