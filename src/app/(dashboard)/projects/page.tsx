'use client';

import { useMemo, useState, useDeferredValue } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { formatBytes } from '@/lib/utils';
import {
  SearchIcon,
  ArrowUpDownIcon,
  LayoutGridIcon,
  ListIcon,
  FolderIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProjectCard, type ProjectData, getStarredIds } from '@/components/dashboard/project-card';
import { CreateProjectDialog } from '@/components/dashboard/create-project-dialog';
import { ImportProjectDialog } from '@/components/dashboard/import-project-dialog';
import { StorageBar } from '@/components/dashboard/storage-bar';
import { GlobalSearch } from '@/components/dashboard/global-search';
import { ActivationChecklist } from '@/components/dashboard/activation-checklist';
import { useUiLocale } from '@/lib/ui-locale';

type SortOption = 'updated' | 'name-asc' | 'name-desc' | 'created';
type RoleFilter = 'all' | 'mine' | 'shared';
type ViewMode = 'grid' | 'list';

const sortLabels: Record<SortOption, string> = {
  updated: 'Recently Modified',
  'name-asc': 'Name A-Z',
  'name-desc': 'Name Z-A',
  created: 'Date Created',
};

export default function ProjectsPage() {
  const { t } = useUiLocale();
  const { data: session } = useSession();
  const { data: projects, isLoading, error: fetchError, mutate: refetchProjects } = useSWR<ProjectData[]>(
    '/api/v1/projects',
    fetcher,
    { shouldRetryOnError: true, errorRetryCount: 3, revalidateOnFocus: false, dedupingInterval: 10000 },
  );

  // ── Local UI state ─────────────────────────────────────────
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState<SortOption>('updated');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const user = session?.user as {
    id?: string;
    storageUsedBytes?: number;
    storageQuotaBytes?: number;
  } | undefined;

  const currentUserId = user?.id ?? '';

  // ── Storage quota warnings ─────────────────────────────────
  const storagePercent =
    user?.storageQuotaBytes && user.storageQuotaBytes > 0
      ? (user.storageUsedBytes ?? 0) / user.storageQuotaBytes
      : 0;
  const showStorageWarning = storagePercent > 0.8;
  const storageIsCritical = storagePercent > 0.95;

  // ── Filter + sort pipeline ─────────────────────────────────
  const filteredProjects = useMemo(() => {
    if (!projects) return [];

    let result = [...projects];

    // Role filter
    if (roleFilter === 'mine') {
      result = result.filter((p) =>
        p.members.some((m) => m.userId === currentUserId && m.role === 'owner'),
      );
    } else if (roleFilter === 'shared') {
      result = result.filter((p) =>
        p.members.some((m) => m.userId === currentUserId && m.role !== 'owner'),
      );
    }

    // Search by name or tags (uses deferred value to avoid blocking UI)
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      const allTags = (() => { try { return JSON.parse(localStorage.getItem('paperforge-project-tags') || '{}'); } catch { return {}; } })();
      result = result.filter((p) => {
        if (p.name.toLowerCase().includes(q)) return true;
        const tags: string[] = allTags[p.id] || [];
        return tags.some(t => t.toLowerCase().includes(q));
      });
    }

    // Sort (starred projects first, then by selected order)
    const starredIds = new Set(getStarredIds());
    result.sort((a, b) => {
      const aStarred = starredIds.has(a.id) ? 1 : 0;
      const bStarred = starredIds.has(b.id) ? 1 : 0;
      if (aStarred !== bStarred) return bStarred - aStarred;
      switch (sort) {
        case 'updated':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return result;
  }, [projects, deferredSearch, sort, roleFilter, currentUserId]);

  // ── Skeleton loading state ─────────────────────────────────
  function renderSkeletons() {
    if (viewMode === 'list') {
      return (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border-l-4 border-l-muted bg-card px-4 py-3 ring-1 ring-foreground/10"
            >
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
              <div className="hidden gap-4 sm:flex">
                <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex -space-x-2">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className="size-6 animate-pulse rounded-full bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl border-l-4 border-l-muted bg-card ring-1 ring-foreground/10"
          >
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="h-5 w-36 animate-pulse rounded bg-muted" />
                <div className="flex gap-1.5">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                  <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex items-center justify-between border-t bg-muted/50 p-4">
              <div className="flex gap-3">
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex -space-x-2">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className="size-6 animate-pulse rounded-full bg-muted" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────
  function renderEmptyState() {
    const hasFilters = search.trim() || roleFilter !== 'all';

    if (hasFilters) {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
          <SearchIcon className="mb-4 size-12 text-muted-foreground/40" />
          <h3 className="text-lg font-medium">{t('No matching projects')}</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {t("Try adjusting your search or filter to find what you're looking for.")}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setSearch('');
              setRoleFilter('all');
            }}
          >
            {t('Clear filters')}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
        <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary/10">
          <FolderIcon className="size-10 text-primary" />
        </div>
        <h3 className="text-xl font-semibold">{t('Create Your First Project')}</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
          {t('Get started by creating a LaTeX project. You can write papers, theses, presentations, and more.')}
        </p>
        <div className="mt-6">
          <CreateProjectDialog />
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────
  if (fetchError && !projects) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/30 py-16">
        <AlertTriangleIcon className="mb-4 size-12 text-destructive/60" />
        <h3 className="text-lg font-medium">{t('Failed to load projects')}</h3>
        <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
          {t("We couldn't fetch your projects. Please check your connection and try again.")}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => refetchProjects()}>
          {t('Retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Storage quota warning banners ───────────────────── */}
      {showStorageWarning && user?.storageQuotaBytes && (
        <div
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
            storageIsCritical
              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
          }`}
        >
          <AlertTriangleIcon className="size-5 shrink-0" />
          <span>
            {storageIsCritical
              ? `Storage almost full! You are using ${formatBytes(user.storageUsedBytes ?? 0)} of ${formatBytes(user.storageQuotaBytes)}. Delete unused projects to free up space.`
              : `Storage usage is high: ${formatBytes(user.storageUsedBytes ?? 0)} of ${formatBytes(user.storageQuotaBytes)} used.`}
          </span>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{t('My Projects')}</h1>
              {!isLoading && projects && (
                <Badge variant="secondary" className="tabular-nums">
                  {projects.length}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('Create, manage, and collaborate on your LaTeX documents.')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearch />
          <ImportProjectDialog />
          <CreateProjectDialog />
        </div>
      </div>

      {user?.storageQuotaBytes && (
        <StorageBar
          usedBytes={user.storageUsedBytes ?? 0}
          quotaBytes={user.storageQuotaBytes}
          className="max-w-sm"
        />
      )}

      {projects && (
        <ActivationChecklist
          projects={projects}
          storageQuotaBytes={user?.storageQuotaBytes}
        />
      )}

      {/* ── Toolbar: search, sort, role filter, view toggle ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative max-w-xs flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('Search projects...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Sort */}
          <Select value={sort} onValueChange={(val) => { if (val) setSort(val as SortOption); }}>
            <SelectTrigger className="w-48 shrink-0">
              <ArrowUpDownIcon className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(sortLabels) as [SortOption, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {t(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {/* Role filter pills */}
          <div className="flex rounded-lg bg-muted p-0.5">
            {([
              ['all', 'All'],
              ['mine', 'My Projects'],
              ['shared', 'Shared'],
            ] as [RoleFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setRoleFilter(value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  roleFilter === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(label)}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg bg-muted p-0.5">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => setViewMode('grid')}
              aria-label={t('Grid view')}
              className={viewMode === 'grid' ? 'shadow-sm' : ''}
            >
              <LayoutGridIcon className="size-3.5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => setViewMode('list')}
              aria-label={t('List view')}
              className={viewMode === 'list' ? 'shadow-sm' : ''}
            >
              <ListIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      {isLoading ? (
        renderSkeletons()
      ) : filteredProjects.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                currentUserId={currentUserId}
                viewMode="grid"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                currentUserId={currentUserId}
                viewMode="list"
              />
            ))}
          </div>
        )
      ) : (
        renderEmptyState()
      )}
    </div>
  );
}
