'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SearchIcon, FileTextIcon, FolderIcon, LoaderCircleIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetcher } from '@/lib/fetcher';

interface SearchResult {
  projectId: string;
  projectName: string;
  filePath?: string;
  matchType: 'project' | 'file';
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Ctrl+Shift+P for global search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const projects = await fetcher<Array<{ id: string; name: string }>>('/api/v1/projects');
        const q = query.toLowerCase();
        const matches: SearchResult[] = [];

        // Search project names
        for (const p of projects) {
          if (p.name.toLowerCase().includes(q)) {
            matches.push({ projectId: p.id, projectName: p.name, matchType: 'project' });
          }
          if (matches.length >= 20) break;
        }

        // Search file names within projects (first 5 matching projects)
        const projectsToSearch = projects.slice(0, 5);
        for (const p of projectsToSearch) {
          try {
            const files = await fetcher<Array<{ path: string }>>(`/api/v1/projects/${p.id}/files`);
            for (const f of files) {
              if (f.path.toLowerCase().includes(q)) {
                matches.push({ projectId: p.id, projectName: p.name, filePath: f.path, matchType: 'file' });
              }
              if (matches.length >= 20) break;
            }
          } catch { /* skip */ }
          if (matches.length >= 20) break;
        }

        setResults(matches);
      } catch { /* ignore */ }
      setLoading(false);
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery('');
    if (result.filePath) {
      router.push(`/editor/${result.projectId}`);
    } else {
      router.push(`/editor/${result.projectId}`);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
      >
        <SearchIcon className="size-3.5" />
        <span>Search projects...</span>
        <kbd className="ml-2 rounded border bg-background px-1 py-0.5 font-mono text-[9px]">Ctrl+Shift+P</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[60vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SearchIcon className="size-5" />
              Search All Projects
            </DialogTitle>
          </DialogHeader>

          <Input
            placeholder="Search projects and files..."
            aria-label="Global search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          <ScrollArea className="max-h-64">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-0.5 py-1">
                {results.map((r, i) => (
                  <button
                    key={`${r.projectId}-${r.filePath ?? i}`}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    onClick={() => handleSelect(r)}
                  >
                    {r.matchType === 'project' ? (
                      <FolderIcon className="size-4 shrink-0 text-orange-500" />
                    ) : (
                      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-xs">{r.matchType === 'file' ? r.filePath : r.projectName}</p>
                      {r.matchType === 'file' && (
                        <p className="truncate text-[10px] text-muted-foreground">{r.projectName}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!loading && query.trim() && results.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
