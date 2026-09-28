/**
 * Client-side project tagging system using localStorage.
 * Tags persist per-browser without requiring database changes.
 */

const STORAGE_KEY = 'paperforge-project-tags';

export interface ProjectTags {
  [projectId: string]: string[];
}

function load(): ProjectTags {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function save(tags: ProjectTags) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

export function getProjectTags(projectId: string): string[] {
  return load()[projectId] || [];
}

export function getAllTags(): string[] {
  const all = load();
  const set = new Set<string>();
  Object.values(all).forEach(tags => tags.forEach(t => set.add(t)));
  return Array.from(set).sort();
}

export function addTag(projectId: string, tag: string) {
  const tags = load();
  const current = tags[projectId] || [];
  if (!current.includes(tag)) {
    tags[projectId] = [...current, tag];
    save(tags);
  }
}

export function removeTag(projectId: string, tag: string) {
  const tags = load();
  tags[projectId] = (tags[projectId] || []).filter(t => t !== tag);
  if (tags[projectId].length === 0) delete tags[projectId];
  save(tags);
}
