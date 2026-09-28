import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';

/**
 * Storage accounting attributes every file's bytes to the project OWNER's
 * account. A user's used storage is the sum of `sizeBytes` across non-deleted
 * files in every non-deleted project they own.
 *
 * That aggregate is the source of truth; `User.storageUsedBytes` is a
 * write-through cache that the service layer keeps in sync on file
 * create/replace/delete and project soft-delete. Display surfaces read the
 * cache, with the admin recalc endpoint available as a repair path.
 */

/** Pure quota decision — extracted so it can be tested without a database. */
export function projectedOverQuota(
  usedBytes: bigint,
  additionalBytes: number,
  quotaBytes: bigint,
): boolean {
  // Shrinking or replacing with a smaller file never needs a quota check.
  if (additionalBytes <= 0) return false;
  return usedBytes + BigInt(Math.ceil(additionalBytes)) > quotaBytes;
}

export async function getProjectOwnerId(projectId: string): Promise<string | null> {
  const owner = await prisma.projectMember.findFirst({
    where: { projectId, role: 'owner' },
    select: { userId: true },
  });
  return owner?.userId ?? null;
}

export async function computeOwnerStorageUsedBytes(ownerId: string): Promise<bigint> {
  const result = await prisma.file.aggregate({
    _sum: { sizeBytes: true },
    where: {
      deletedAt: null,
      project: {
        deletedAt: null,
        members: { some: { userId: ownerId, role: 'owner' } },
      },
    },
  });
  return result._sum.sizeBytes ?? BigInt(0);
}

/** Recompute usage from the files table and write it back to the cache column. */
export async function syncUserStorageUsed(ownerId: string): Promise<bigint> {
  const used = await computeOwnerStorageUsedBytes(ownerId);
  await prisma.user.update({
    where: { id: ownerId },
    data: { storageUsedBytes: used },
  });
  return used;
}

/**
 * Backfill/repair every account's cached `storageUsedBytes` from the files
 * table. Useful once after introducing storage accounting (existing rows are
 * stale until their owner's next write) and as an admin repair action.
 */
export async function recalculateAllUsersStorage(): Promise<{ updated: number }> {
  const users = await prisma.user.findMany({ select: { id: true } });
  let updated = 0;
  for (const user of users) {
    await syncUserStorageUsed(user.id);
    updated += 1;
  }
  return { updated };
}

/**
 * Throw 413 if adding `additionalBytes` to the owner's current usage would
 * exceed their plan quota. A null/missing owner is treated as unenforceable
 * (the write proceeds; it will fail later if the project is genuinely invalid).
 */
export async function assertStorageQuota(ownerId: string, additionalBytes: number): Promise<void> {
  if (additionalBytes <= 0) return;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { storageQuotaBytes: true },
  });
  if (!owner) return;

  const used = await computeOwnerStorageUsedBytes(ownerId);
  if (projectedOverQuota(used, additionalBytes, owner.storageQuotaBytes)) {
    throw new ApiError(
      413,
      'Storage quota exceeded. Delete unused files or upgrade your plan for more storage.',
      'STORAGE_QUOTA_EXCEEDED',
    );
  }
}
