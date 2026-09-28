'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Confirmation step for share-link joins. We never auto-join on page load
 * because the API used to be a GET endpoint — a leaked link in an attacker's
 * <img> tag silently enrolled the victim into the attacker's project. The
 * user must click Join, which posts to the API; declining just sends them
 * back to the dashboard.
 */
export default function JoinSharePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';

  const [status, setStatus] = useState<'idle' | 'joining' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  async function handleJoin() {
    if (!token) return;
    setStatus('joining');
    setError('');
    try {
      const res = await fetch(`/api/v1/join/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        error?: string;
      };
      if (!res.ok) {
        setStatus('error');
        setError(body.error || 'Could not join the project.');
        return;
      }
      const projectId = body.data?.id;
      router.push(projectId ? `/editor/${projectId}` : '/projects');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Network error.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join project</CardTitle>
          <CardDescription>
            You were invited to a PaperForge project via a share link. Click
            Join to add yourself as a member.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/projects')}
            disabled={status === 'joining'}
          >
            Cancel
          </Button>
          <Button onClick={handleJoin} disabled={status === 'joining' || !token}>
            {status === 'joining' ? 'Joining…' : 'Join project'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
