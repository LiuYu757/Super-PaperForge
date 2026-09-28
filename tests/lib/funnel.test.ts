import { describe, it, expect } from 'vitest';
import { pct, buildFunnel } from '@/lib/funnel';

describe('pct', () => {
  it('returns an integer percentage', () => {
    expect(pct(50, 80)).toBe(63); // round(62.5)
    expect(pct(80, 100)).toBe(80);
  });
  it('returns null when the whole is zero', () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(5, 0)).toBeNull();
  });
});

describe('buildFunnel', () => {
  it('orders stages and computes per-previous and per-registered rates', () => {
    const report = buildFunnel({
      registered: 100,
      verified: 80,
      createdProject: 50,
      activated: 10,
      canceled: 2,
    });

    expect(report.registered).toBe(100);
    expect(report.stages.map((s) => s.id)).toEqual(['registered', 'verified', 'created_project']);

    const [reg, ver, proj] = report.stages;
    expect(reg.count).toBe(100);
    expect(reg.pctOfRegistered).toBe(100);
    expect(reg.pctOfPrevious).toBeNull(); // first stage has no previous

    expect(ver.count).toBe(80);
    expect(ver.pctOfRegistered).toBe(80);
    expect(ver.pctOfPrevious).toBe(80);

    expect(proj.count).toBe(50);
    expect(proj.pctOfRegistered).toBe(50);
    expect(proj.pctOfPrevious).toBe(63); // 50/80

    expect(report.conversion).toEqual({ activated: 10, canceled: 2, net: 8, rate: 10 });
  });

  it('handles an empty platform without dividing by zero', () => {
    const report = buildFunnel({
      registered: 0,
      verified: 0,
      createdProject: 0,
      activated: 0,
      canceled: 0,
    });
    expect(report.stages.every((s) => s.pctOfRegistered === null)).toBe(true);
    expect(report.conversion.rate).toBeNull();
    expect(report.conversion.net).toBe(0);
  });

  it('never reports negative net conversions', () => {
    const report = buildFunnel({
      registered: 10,
      verified: 10,
      createdProject: 10,
      activated: 1,
      canceled: 4,
    });
    expect(report.conversion.net).toBe(0);
  });
});
