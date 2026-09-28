'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { useUiLocale } from '@/lib/ui-locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function CreateProjectDialog() {
  const { t } = useUiLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [compiler, setCompiler] = useState('pdflatex');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    setError('');
    setLimitReached(false);

    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), compiler }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setLimitReached(errData.error?.code === 'PLAN_LIMIT_REACHED');
        throw new Error(errData.error?.message || errData.error || 'Failed to create project');
      }

      const result = await res.json();
      const project = result.data ?? result;
      setOpen(false);
      setName('');
      setCompiler('pdflatex');
      router.push(`/editor/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        {t('New Project')}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('Create Project')}</DialogTitle>
            <DialogDescription>
              {t('Start a new LaTeX project. You can invite collaborators later.')}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-name">{t('Project Name')}</Label>
              <Input
                id="project-name"
                placeholder={t('My LaTeX Paper')}
                aria-label="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="compiler-select">{t('Compiler')}</Label>
              <Select value={compiler} onValueChange={(val) => { if (val) setCompiler(val); }}>
                <SelectTrigger id="compiler-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdflatex">pdfLaTeX</SelectItem>
                  <SelectItem value="xelatex">XeLaTeX</SelectItem>
                  <SelectItem value="lualatex">LuaLaTeX</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('pdfLaTeX is recommended for most documents. Use XeLaTeX or LuaLaTeX for Unicode fonts.')}
              </p>
            </div>

            {error && (
              <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{t(error)}</p>
                {limitReached && (
                  <Link href="/billing" className={buttonVariants({ size: 'sm' })}>
                    {t('Upgrade Plan')}
                  </Link>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" disabled={loading}>
              {t(loading ? 'Creating...' : 'Create Project')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
