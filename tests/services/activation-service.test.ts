import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
  },
}));

import { recordActivationEvent } from '@/services/activation-service';

describe('recordActivationEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userUpdate.mockResolvedValue({ id: 'user-1' });
  });

  it('writes a new marker into settings, preserving existing keys', async () => {
    mocks.userFindUnique.mockResolvedValue({ settings: { theme: 'dark' } });

    const recorded = await recordActivationEvent('user-1', 'created_project');

    expect(recorded).toBe(true);
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
    const arg = mocks.userUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'user-1' });
    expect(arg.data.settings.theme).toBe('dark');
    expect(typeof arg.data.settings.activationEvents.created_project).toBe('string');
  });

  it('does not write when the marker already exists (idempotent)', async () => {
    mocks.userFindUnique.mockResolvedValue({
      settings: { activationEvents: { created_project: '2026-01-01T00:00:00.000Z' } },
    });

    const recorded = await recordActivationEvent('user-1', 'created_project');

    expect(recorded).toBe(false);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('returns false when the user does not exist (no throw)', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const recorded = await recordActivationEvent('ghost', 'created_project');
    expect(recorded).toBe(false);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
