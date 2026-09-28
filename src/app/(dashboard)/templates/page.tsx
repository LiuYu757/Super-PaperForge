'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { SearchIcon, FileTextIcon, BookOpenIcon, PresentationIcon, MailIcon, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';


interface Template {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  thumbnailUrl?: string | null;
  downloadCount: number;
  author?: { id: string; name: string } | null;
}

const CATEGORIES = [
  { value: 'all', label: 'All', icon: FileTextIcon },
  { value: 'journal', label: 'Journal', icon: BookOpenIcon },
  { value: 'thesis', label: 'Thesis', icon: BookOpenIcon },
  { value: 'presentation', label: 'Presentation', icon: PresentationIcon },
  { value: 'letter', label: 'Letter', icon: MailIcon },
  { value: 'cv', label: 'CV', icon: UserIcon },
];

function CategoryIcon({ category }: { category?: string | null }) {
  switch (category) {
    case 'journal':
      return <BookOpenIcon className="size-8 text-blue-500" />;
    case 'thesis':
      return <BookOpenIcon className="size-8 text-purple-500" />;
    case 'presentation':
      return <PresentationIcon className="size-8 text-green-500" />;
    case 'letter':
      return <MailIcon className="size-8 text-orange-500" />;
    case 'cv':
      return <UserIcon className="size-8 text-red-500" />;
    default:
      return <FileTextIcon className="size-8 text-muted-foreground" />;
  }
}

export default function TemplatesPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const params = new URLSearchParams();
  if (activeCategory !== 'all') params.set('category', activeCategory);
  if (debouncedSearch) params.set('search', debouncedSearch);

  const { data: templates, isLoading } = useSWR<Template[]>(
    `/api/v1/templates?${params.toString()}`,
    fetcher,
  );

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }

  function openUseTemplate(template: Template) {
    setSelectedTemplate(template);
    setProjectName(`${template.name} - Copy`);
    setError('');
  }

  async function handleCreateProject() {
    if (!selectedTemplate || !projectName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch(
        `/api/v1/projects/from-template/${selectedTemplate.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: projectName.trim() }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create project');
        return;
      }
      const result = await res.json();
      const project = result.data ?? result;
      router.push(`/editor/${project.id}`);
    } catch {
      setError('Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Template Gallery</h1>
          <p className="text-sm text-muted-foreground">
            Start your document from a curated academic template.
          </p>
        </div>
        {templates && (
          <Badge variant="secondary" className="text-xs">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={activeCategory === cat.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat.value)}
            aria-pressed={activeCategory === cat.value}
          >
            <cat.icon className="mr-1.5 size-4" />
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col transition-all duration-200 hover:shadow-lg hover:border-orange-200 dark:hover:border-orange-800 hover:-translate-y-0.5">
              <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-2">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {template.thumbnailUrl ? (
                    <Image
                      src={template.thumbnailUrl}
                      alt={template.name}
                      width={64}
                      height={64}
                      className="size-full rounded-lg object-cover"
                      unoptimized
                    />
                  ) : (
                    <CategoryIcon category={template.category} />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <CardTitle className="text-base leading-tight">{template.name}</CardTitle>
                  {template.category && (
                    <Badge variant="secondary" className="capitalize text-xs">
                      {template.category}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 pb-2">
                <CardDescription className="line-clamp-3 text-sm">
                  {template.description ?? 'No description provided.'}
                </CardDescription>
              </CardContent>
              <CardFooter className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  {template.downloadCount.toLocaleString()} uses
                </span>
                <Button size="sm" onClick={() => openUseTemplate(template)}>
                  Use Template
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <FileTextIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">No templates found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your search or category filter.
          </p>
        </div>
      )}

      {/* Use Template dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={(open) => { if (!open) setSelectedTemplate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Template: {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              Enter a name for your new project. It will be pre-filled with the template content.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-1.5 block text-sm font-medium">Project Name</label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My new project"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); }}
            />
            {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTemplate(null)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={creating || !projectName.trim()}>
              {creating ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
