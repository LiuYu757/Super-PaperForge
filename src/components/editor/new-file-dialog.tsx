'use client';

import { useState, useEffect } from 'react';
import { FilePlusIcon } from 'lucide-react';
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
import { createFileText, ApiClientError } from '@/lib/api-client';

interface NewFileDialogProps {
  projectId: string;
  onCreated: () => void;
}

export function NewFileDialog({ projectId, onCreated }: NewFileDialogProps) {
  const [open, setOpen] = useState(false);

  // Listen for Ctrl+N event
  useEffect(() => {
    function handleNewFile() { setOpen(true); }
    window.addEventListener('new-file', handleNewFile);
    return () => window.removeEventListener('new-file', handleNewFile);
  }, []);
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const path = filePath.trim();
    if (!path) {
      setError('File name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create-only (If-None-Match: *): the server refuses when the path is
      // already taken, and the response envelope is validated — a 4xx/5xx is
      // an error the user sees, never a silent "created".
      await createFileText(projectId, path, '');

      setOpen(false);
      setFilePath('');
      onCreated();
      toast.success('File created');
    } catch (err) {
      const message = err instanceof ApiClientError
        ? err.message
        : err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      toast.error('Failed to create file');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="ghost" size="icon" className="size-6" aria-label="New file" />
      }>
        <FilePlusIcon className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
            <DialogDescription>
              Enter a path for the new file, e.g. <code>sections/intro.tex</code>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="new-file-path">File path</Label>
            <Input
              id="new-file-path"
              placeholder="main.tex"
              aria-label="File path"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" disabled={loading || !filePath.trim()}>
              {loading ? 'Creating…' : 'Create File'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
