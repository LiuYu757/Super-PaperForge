/**
 * Track recently accessed projects in localStorage.
 */
const KEY = 'paperforge-recent-projects';
const MAX = 10;

interface RecentEntry {
  id: string;
  name: string;
  accessedAt: number;
}

function isRecentEntry(v: unknown): v is RecentEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === 'string' && typeof e.name === 'string' && typeof e.accessedAt === 'number';
}

export function getRecentProjects(): RecentEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // localStorage is per-browser-tab user-writable storage; if a paste or
    // extension corrupts the value, reject it instead of letting downstream
    // code consume malformed entries.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEntry).slice(0, MAX);
  } catch {
    return [];
  }
}

export function trackProjectAccess(id: string, name: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const list = getRecentProjects().filter((p) => p.id !== id);
    list.unshift({ id, name, accessedAt: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // localStorage write can throw (quota exceeded, private mode). Recent
    // list is a non-essential convenience — swallowing is the right call.
  }
}
