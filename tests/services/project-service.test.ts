import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectMemberFindFirst: vi.fn(),
  projectUpdate: vi.fn(),
  syncUserStorageUsed: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectMember: {
      findFirst: mocks.projectMemberFindFirst,
    },
    project: {
      update: mocks.projectUpdate,
    },
  },
}));

vi.mock('@/lib/storage', () => ({
  syncUserStorageUsed: mocks.syncUserStorageUsed,
}));

vi.mock('@/services/audit-service', () => ({
  logAuditAction: mocks.logAuditAction,
}));

import { deleteProject } from '@/services/project-service';

describe('deleteProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectMemberFindFirst.mockResolvedValue({
      projectId: 'project-1',
      userId: 'owner-1',
      role: 'owner',
    });
    mocks.projectUpdate.mockResolvedValue({
      id: 'project-1',
      name: 'Paper draft',
      deletedAt: new Date('2026-06-09T00:00:00.000Z'),
    });
    mocks.syncUserStorageUsed.mockResolvedValue(BigInt(0));
    mocks.logAuditAction.mockResolvedValue(undefined);
  });

  it('refreshes the owner storage cache after soft-deleting the project', async () => {
    await deleteProject('project-1', 'owner-1');

    expect(mocks.projectUpdate).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { deletedAt: expect.any(Date) },
      select: { id: true, name: true, deletedAt: true },
    });
    expect(mocks.syncUserStorageUsed).toHaveBeenCalledWith('owner-1');
    expect(mocks.projectUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.syncUserStorageUsed.mock.invocationCallOrder[0],
    );
  });
});
