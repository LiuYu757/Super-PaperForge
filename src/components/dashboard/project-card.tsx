'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileTextIcon,
  ClockIcon,
  MoreVerticalIcon,
  ExternalLinkIcon,
  CopyIcon,
  Trash2Icon,
  Share2Icon,
  PencilIcon,
  StarIcon,
  TagIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useUiLocale } from '@/lib/ui-locale';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ShareDialog } from './share-dialog';
import { toast } from 'sonner';

interface ProjectMember {
  userId: string;
  role: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  compiler: string;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  members: ProjectMember[];
  _count: {
    files: number;
  };
}

/** Accent colour for the left border based on compiler type. */
const compilerAccent: Record<string, string> = {
  pdflatex: 'border-l-blue-500',
  xelatex: 'border-l-emerald-500',
  lualatex: 'border-l-violet-500',
};

/** Human-friendly compiler display name. */
const compilerLabel: Record<string, string> = {
  pdflatex: 'pdfLaTeX',
  xelatex: 'XeLaTeX',
  lualatex: 'LuaLaTeX',
};

/** Badge variant colour per compiler. */
const compilerBadgeBg: Record<string, string> = {
  pdflatex: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  xelatex: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  lualatex: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
};

/** Badge colour per role. */
const roleBadgeStyle: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  editor: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

interface ProjectCardProps {
  project: ProjectData;
  currentUserId: string;
  /** 'list' renders a horizontal row layout; 'grid' (default) the traditional card. */
  viewMode?: 'grid' | 'list';
}

export function getStarredIds(): string[] {
  try { return JSON.parse(localStorage.getItem('paperforge-starred') || '[]'); } catch { return []; }
}

function useStarred(projectId: string) {
  const key = 'paperforge-starred';
  const [starred, setStarredState] = useState(false);
  useEffect(() => {
    try { setStarredState(JSON.parse(localStorage.getItem(key) || '[]').includes(projectId)); } catch {}
  }, [projectId]);
  const toggle = () => {
    try {
      const list: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const next = list.includes(projectId) ? list.filter(id => id !== projectId) : [...list, projectId];
      localStorage.setItem(key, JSON.stringify(next));
      setStarredState((prev) => !prev);
    } catch {}
  };
  return { starred, toggle };
}

export function ProjectCard({ project, currentUserId, viewMode = 'grid' }: ProjectCardProps) {
  const { locale, t } = useUiLocale();
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [newName, setNewName] = useState(project.name);
  const { starred, toggle: toggleStar } = useStarred(project.id);
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    import('@/lib/project-tags').then(({ getProjectTags }) => setTags(getProjectTags(project.id)));
  }, [project.id]);
  const maxAvatars = 3;
  const visibleMembers = project.members.slice(0, maxAvatars);
  const remainingCount = project.members.length - maxAvatars;

  // Current user's role in this project
  const currentMember = project.members.find((m) => m.userId === currentUserId);
  const currentUserRole = currentMember?.role ?? 'viewer';
  const isOwner = currentUserRole === 'owner';

  const accent = compilerAccent[project.compiler] ?? 'border-l-gray-400';

  const relativeTime = formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true, locale: locale === 'zh-CN' ? zhCN : undefined });

  async function handleDuplicate() {
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${project.name} (Copy)`,
          compiler: project.compiler,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const newProject = result.data ?? result;
        router.push(`/editor/${newProject.id}`);
      } else {
        toast.error('Failed to duplicate project');
      }
    } catch {
      toast.error('Failed to duplicate project');
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      // Auto-reset after 5s if user doesn't confirm (longer window for accessibility)
      const timer = setTimeout(() => setDeleteConfirm(false), 5000);
      // Store timer so it can be cleared on unmount
      return () => clearTimeout(timer);
    }
    setDeleteConfirm(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Project deleted');
        window.dispatchEvent(new Event('focus'));
      } else {
        toast.error('Failed to delete project');
      }
    } catch {
      toast.error('Failed to delete project');
    } finally {
      setDeleting(false);
    }
  }

  async function handleRename() {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === project.name) { setRenaming(false); return; }
    try {
      const res = await fetch(`/api/v1/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        toast.success('Project renamed');
        window.dispatchEvent(new Event('focus'));
      } else {
        toast.error('Failed to rename');
      }
    } catch {
      toast.error('Failed to rename');
    }
    setRenaming(false);
  }

  // ── List view ──────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className="group relative">
        <Link href={`/editor/${project.id}`} className="block">
          <div
            className={`flex items-center gap-4 rounded-xl border-l-4 bg-card px-4 py-3 ring-1 ring-foreground/10 transition-all duration-200 hover:shadow-md hover:ring-foreground/20 hover:-translate-y-px ${accent}`}
          >
            {/* Name + description */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{project.name}</span>
                <Badge
                  className={`shrink-0 border-0 text-[10px] uppercase ${compilerBadgeBg[project.compiler] ?? ''}`}
                >
                  {compilerLabel[project.compiler] ?? project.compiler}
                </Badge>
                <Badge
                  className={`shrink-0 border-0 text-[10px] capitalize ${roleBadgeStyle[currentUserRole] ?? roleBadgeStyle.viewer}`}
                >
                  {t(currentUserRole)}
                </Badge>
              </div>
              {project.description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {project.description}
                </p>
              )}
            </div>

            {/* Meta */}
            <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1">
                <FileTextIcon className="size-3.5" />
                {project._count.files}
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <ClockIcon className="size-3.5" />
                {relativeTime}
              </span>
            </div>

            {/* Avatars */}
            <AvatarGroup>
              {visibleMembers.map((member) => (
                <Avatar key={member.userId} size="sm">
                  {member.user.avatarUrl && (
                    <AvatarImage src={member.user.avatarUrl} alt={member.user.name} />
                  )}
                  <AvatarFallback>
                    {member.user.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {remainingCount > 0 && (
                <AvatarGroupCount>+{remainingCount}</AvatarGroupCount>
              )}
            </AvatarGroup>
          </div>
        </Link>

        {/* Quick-actions menu */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Actions for ${project.name}`}
                />
              }
            >
              <MoreVerticalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
              <DropdownMenuItem
                onClick={() => router.push(`/editor/${project.id}`)}
              >
                <ExternalLinkIcon className="size-4" />
                {t('Open')}
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <PencilIcon className="size-4" />
                  {t('Rename')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => { setAddingTag(true); setTagInput(''); }}>
                <TagIcon className="size-4" />
                {t('Add Tag')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDuplicate()}>
                <CopyIcon className="size-4" />
                {t('Duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setShareOpen(true);
                }}
              >
                <Share2Icon className="size-4" />
                {t('Share')}
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    aria-label={deleteConfirm ? 'Click again to confirm deletion' : `Delete ${project.name}`}
                    className={deleteConfirm ? 'font-semibold animate-pulse' : ''}
                  >
                    <Trash2Icon className="size-4" />
                    {t(deleting ? 'Deleting...' : deleteConfirm ? 'Click again to confirm' : 'Delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ShareDialog
          projectId={project.id}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />

        {/* Inline tag input */}
        {addingTag && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-1 rounded-b-xl border-t bg-background px-3 py-1.5 shadow-lg">
            <TagIcon className="size-3 text-muted-foreground" />
            <input
              autoFocus
              placeholder="e.g. thesis, draft"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  import('@/lib/project-tags').then(({ addTag }) => {
                    addTag(project.id, tagInput.trim());
                    setTags(prev => prev.includes(tagInput.trim()) ? prev : [...prev, tagInput.trim()]);
                    toast.success(`Tagged: ${tagInput.trim()}`);
                  });
                  setAddingTag(false);
                }
                if (e.key === 'Escape') setAddingTag(false);
              }}
              onBlur={() => setAddingTag(false)}
              className="h-5 flex-1 bg-transparent text-xs outline-none"
            />
          </div>
        )}
      </div>
    );
  }

  // ── Grid view (default) ────────────────────────────────────
  return (
    <div className="group relative block">
      <Link href={`/editor/${project.id}`} className="block">
        <Card
          className={`border-l-4 transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:ring-foreground/20 hover:-translate-y-1 ${accent}`}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              {renaming ? (
                <input
                  autoFocus
                  className="w-full rounded border bg-background px-2 py-0.5 text-sm font-semibold outline-none focus:ring-1 focus:ring-ring"
                  value={newName}
                  maxLength={255}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(); if (e.key === 'Escape') setRenaming(false); }}
                  onBlur={() => void handleRename()}
                />
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleStar(); }} title={starred ? 'Unstar' : 'Star'} className="shrink-0">
                    <StarIcon className={`size-3.5 transition-colors ${starred ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400'}`} />
                  </button>
                  <CardTitle className="truncate">{project.name}</CardTitle>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge
                  className={`border-0 text-[10px] uppercase ${compilerBadgeBg[project.compiler] ?? ''}`}
                >
                  {compilerLabel[project.compiler] ?? project.compiler}
                </Badge>
                <Badge
                  className={`border-0 text-[10px] capitalize ${roleBadgeStyle[currentUserRole] ?? roleBadgeStyle.viewer}`}
                >
                  {t(currentUserRole)}
                </Badge>
              </div>
            </div>
            {project.description && (
              <CardDescription className="line-clamp-2">
                {project.description}
              </CardDescription>
            )}
            {tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[9px] font-medium text-orange-600 dark:text-orange-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </CardHeader>
          <CardFooter className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <FileTextIcon className="size-3.5" />
                {project._count.files} {project._count.files === 1 ? 'file' : 'files'}
              </span>
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3.5" />
                {relativeTime}
              </span>
            </div>
            <AvatarGroup>
              {visibleMembers.map((member) => (
                <Avatar key={member.userId} size="sm">
                  {member.user.avatarUrl && (
                    <AvatarImage src={member.user.avatarUrl} alt={member.user.name} />
                  )}
                  <AvatarFallback>
                    {member.user.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {remainingCount > 0 && (
                <AvatarGroupCount>+{remainingCount}</AvatarGroupCount>
              )}
            </AvatarGroup>
          </CardFooter>
        </Card>
      </Link>

      {/* Quick-actions three-dot menu */}
      <div className="absolute right-3 top-3 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Actions for ${project.name}`}
              />
            }
          >
            <MoreVerticalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
            <DropdownMenuItem
              onClick={() => router.push(`/editor/${project.id}`)}
            >
              <ExternalLinkIcon className="size-4" />
              {t('Open')}
            </DropdownMenuItem>
            {isOwner && (
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <PencilIcon className="size-4" />
                {t('Rename')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => void handleDuplicate()}>
              <CopyIcon className="size-4" />
              {t('Duplicate')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setShareOpen(true);
              }}
            >
              <Share2Icon className="size-4" />
              {t('Share')}
            </DropdownMenuItem>
            {isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  aria-label={deleteConfirm ? 'Click again to confirm deletion' : `Delete ${project.name}`}
                  className={deleteConfirm ? 'font-semibold animate-pulse' : ''}
                >
                  <Trash2Icon className="size-4" />
                  {t(deleting ? 'Deleting...' : deleteConfirm ? 'Click again to confirm' : 'Delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ShareDialog
        projectId={project.id}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}
