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

import { recordCampaignAttribution } from '@/services/campaign-service';

describe('recordCampaignAttribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userUpdate.mockResolvedValue({ id: 'user-1' });
  });

  it('parses and persists first-touch attribution', async () => {
    mocks.userFindUnique.mockResolvedValue({ settings: { theme: 'dark' } });
    const recorded = await recordCampaignAttribution('user-1', {
      utm_source: 'google',
      utm_campaign: 'launch',
    });
    expect(recorded).toBe(true);
    const arg = mocks.userUpdate.mock.calls[0][0];
    expect(arg.data.settings.theme).toBe('dark');
    expect(arg.data.settings.attribution.source).toBe('google');
    expect(arg.data.settings.attribution.campaign).toBe('launch');
    expect(typeof arg.data.settings.attribution.capturedAt).toBe('string');
  });

  it('does nothing when there is no usable attribution', async () => {
    const recorded = await recordCampaignAttribution('user-1', { foo: 'bar' });
    expect(recorded).toBe(false);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('does not overwrite existing attribution (first-touch)', async () => {
    mocks.userFindUnique.mockResolvedValue({
      settings: { attribution: { source: 'twitter', capturedAt: '2026-01-01T00:00:00.000Z' } },
    });
    const recorded = await recordCampaignAttribution('user-1', { utm_source: 'google' });
    expect(recorded).toBe(false);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('returns false for a missing user', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const recorded = await recordCampaignAttribution('ghost', { utm_source: 'google' });
    expect(recorded).toBe(false);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
