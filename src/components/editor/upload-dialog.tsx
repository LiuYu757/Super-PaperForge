'use client';

import { useState, useRef } from 'react';
import { UploadIcon } from 'lucide-react';
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

interface UploadDialogProps {
  projectId: string;
  onUploaded: () => void;
}

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'text/plain',
  'application/x-bibtex',
  '.bib',
  '.cls',
  '.sty',
  '.tex',
  '.pdf',
].join(',');

export function UploadDialog({ projectId, onUploaded }: UploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customPath, setCustomPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !customPath) {
      setCustomPath(file.name);
    }
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (customPath.trim() && customPath.trim() !== selectedFile.name) {
        formData.append('path', customPath.trim());
      }

      const res = await fetch(`/api/v1/projects/${projectId}/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Upload failed');
      }

      setOpen(false);
      setSelectedFile(null);
      setCustomPath('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
      toast.success('File uploaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      toast.error('Upload failed');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelectedFile(null);
      setCustomPath('');
      setError('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={
        <Button variant="ghost" size="icon" className="size-6" aria-label="Upload file" />
      }>
        <UploadIcon className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>
              Upload an image, bibliography, style, or class file to your project.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="upload-file-input">File</Label>
              <input
                ref={inputRef}
                id="upload-file-input"
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileChange}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs file:font-medium"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="upload-path">Save as (optional)</Label>
              <Input
                id="upload-path"
                placeholder={selectedFile?.name ?? 'filename.png'}
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" disabled={loading || !selectedFile}>
              {loading ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
