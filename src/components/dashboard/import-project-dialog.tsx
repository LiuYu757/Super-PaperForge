'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadIcon, GithubIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUiLocale } from '@/lib/ui-locale';

type ImportMode = 'zip' | 'github';

export function ImportProjectDialog() {
  const { t } = useUiLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>('zip');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let res: Response;

      if (mode === 'zip') {
        if (!file) { setError('Please select a ZIP file'); setLoading(false); return; }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name.trim() || file.name.replace(/\.zip$/i, ''));
        res = await fetch('/api/v1/projects/import', { method: 'POST', body: formData });
      } else {
        if (!githubUrl.trim()) { setError('Please enter a GitHub URL'); setLoading(false); return; }
        res = await fetch('/api/v1/projects/import-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: githubUrl.trim(), name: name.trim() || undefined }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: { message?: string } }).error?.message || 'Import failed');
      }

      const result = await res.json();
      const project = result.data?.project ?? result.project;
      toast.success(`Imported ${result.data?.importedFiles ?? 0} files`);
      setOpen(false);
      router.push(`/editor/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      toast.error('Import failed');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = mode === 'zip' ? !!file : !!githubUrl.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UploadIcon data-icon="inline-start" />
        {t('Import')}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('Import Project')}</DialogTitle>
            <DialogDescription>
              {t('Import an existing LaTeX project from a ZIP file or GitHub repository.')}
            </DialogDescription>
          </DialogHeader>

          {/* Mode tabs */}
          <div className="mt-4 flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'zip' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setMode('zip')}
            >
              <UploadIcon className="mr-1.5 inline size-3.5" />
              {t('ZIP File')}
            </button>
            <button
              type="button"
              className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'github' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setMode('github')}
            >
              <GithubIcon className="mr-1.5 inline size-3.5" />
              {t('GitHub URL')}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-name">{t('Project Name')} <span className="text-muted-foreground">{t('(optional)')}</span></Label>
              <Input id="import-name" placeholder={t('Auto-detected from source')} aria-label={t('Project Name')} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            {mode === 'zip' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-file">{t('ZIP File')}</Label>
                <Input id="import-file" type="file" accept=".zip" aria-label="ZIP file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">{t('Download from Overleaf → Menu → Source → Upload here.')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-url">{t('GitHub Repository URL')}</Label>
                <Input id="import-url" type="url" placeholder="https://github.com/owner/repo" aria-label="GitHub URL" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t('Public repositories only. Imports the main/master branch.')}</p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{t(error)}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" disabled={loading || !canSubmit}>
              {t(loading ? 'Importing...' : 'Import Project')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
