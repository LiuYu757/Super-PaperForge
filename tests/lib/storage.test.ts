import { describe, expect, it } from 'vitest';
import { projectedOverQuota } from '@/lib/storage';
import { BILLING_PLANS } from '@/lib/billing-plans';

const FREE = BigInt(BILLING_PLANS.free.storageBytes); // 2 GiB

describe('storage quota math', () => {
  it('allows writes that fit within quota', () => {
    expect(projectedOverQuota(BigInt(0), 1000, FREE)).toBe(false);
    // Exactly filling the quota is allowed (strictly-greater-than is the limit).
    expect(projectedOverQuota(FREE - BigInt(10), 10, FREE)).toBe(false);
  });

  it('blocks writes that exceed quota', () => {
    expect(projectedOverQuota(FREE, 1, FREE)).toBe(true);
    expect(projectedOverQuota(FREE - BigInt(5), 10, FREE)).toBe(true);
  });

  it('never blocks shrinking or no-op writes, even when already over quota', () => {
    expect(projectedOverQuota(FREE + BigInt(1000), 0, FREE)).toBe(false);
    expect(projectedOverQuota(FREE + BigInt(1000), -500, FREE)).toBe(false);
  });

  it('rounds fractional additional bytes up before comparing', () => {
    expect(projectedOverQuota(FREE, 0.1, FREE)).toBe(true);
  });
});
