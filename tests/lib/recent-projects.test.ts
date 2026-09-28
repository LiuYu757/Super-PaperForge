// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRecentProjects, trackProjectAccess } from '@/lib/recent-projects';

// jsdom provides a real localStorage; make sure each test starts clean.
beforeEach(() => {
  localStorage.clear();
});

describe('recent-projects (localStorage-backed)', () => {
  it('returns [] when nothing is stored', () => {
    expect(getRecentProjects()).toEqual([]);
  });

  it('rejects malformed (non-array) localStorage payloads', () => {
    localStorage.setItem('paperforge-recent-projects', '"not an array"');
    expect(getRecentProjects()).toEqual([]);
  });

  it('rejects entries that fail the shape check', () => {
    localStorage.setItem(
      'paperforge-recent-projects',
      JSON.stringify([{ id: 'a', name: 'A', accessedAt: 1 }, { id: 'no-time' }, null, 'wat']),
    );
    expect(getRecentProjects()).toEqual([{ id: 'a', name: 'A', accessedAt: 1 }]);
  });

  it('caps the list to MAX=10 after writes', () => {
    for (let i = 0; i < 15; i++) {
      trackProjectAccess(`id-${i}`, `Project ${i}`);
    }
    const list = getRecentProjects();
    expect(list.length).toBe(10);
    // Most recently tracked comes first.
    expect(list[0].id).toBe('id-14');
  });

  it('moves an already-tracked id to the front (dedup)', () => {
    trackProjectAccess('a', 'A');
    trackProjectAccess('b', 'B');
    trackProjectAccess('a', 'A');
    const list = getRecentProjects();
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('swallows localStorage write errors (quota / private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => trackProjectAccess('x', 'X')).not.toThrow();
    spy.mockRestore();
  });
});
