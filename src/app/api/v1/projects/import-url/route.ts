import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { ApiError, errorResponse } from '@/lib/errors';
import { createProjectWithTextFiles } from '@/services/project-service';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { isValidFilePath, LIMITS, RATE_LIMITS } from '@/lib/constants';
import { parseZipTextEntries, ZIP_IMPORT_LIMITS } from '@/lib/zip-import';
import { enforceRateLimit } from '@/lib/rate-limit';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

const GITHUB_ARCHIVE_TIMEOUT_MS = 15000;

const importUrlSchema = z.object({
  url: z.string().url().refine(
    (u) => parseGitHubRepoUrl(u) !== null,
    'Only GitHub repository URLs are supported',
  ),
  name: z.string().min(1).max(255).optional(),
});

type GitHubRepoRef = { owner: string; repoName: string; branch: string };
type ArchiveFetchResult =
  | { status: 'ok'; buffer: Buffer }
  | { status: 'error' | 'timeout' | 'too-large' };

/**
 * POST /api/v1/projects/import-url
 * Import a project from a GitHub repository URL.
 * Downloads the repo as a ZIP and extracts text files.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(
      `rate:import:${userId}`,
      RATE_LIMITS.IMPORT,
      'You have imported too many projects recently. Please try again later.',
    );
    if (limited) return limited;

    const body = await request.json();
    const { url, name } = importUrlSchema.parse(body);
    const parsed = parseGitHubRepoUrl(url);
    if (!parsed) return apiError('Invalid GitHub URL', 400);

    const { owner, repoName, branch } = parsed;
    const projectName = name || repoName;

    const archive = await fetchGitHubArchive(owner, repoName, branch);
    if (archive.status === 'too-large') {
      return apiError('Repository archive is too large to import.', 413, 'ARCHIVE_TOO_LARGE');
    }
    if (archive.status === 'timeout') {
      return apiError('Repository download timed out. Try again later.', 504, 'GITHUB_TIMEOUT');
    }
    if (archive.status === 'error') {
      const fallback = branch === 'master'
        ? archive
        : await fetchGitHubArchive(owner, repoName, 'master');
      if (fallback.status === 'too-large') {
        return apiError('Repository archive is too large to import.', 413, 'ARCHIVE_TOO_LARGE');
      }
      if (fallback.status !== 'ok') {
        return apiError('Could not download repository. Ensure it is public and the URL is correct.', 400);
      }
      return importFromZipBuffer(userId, projectName, fallback.buffer, repoName);
    }
    if (archive.status !== 'ok') {
      return apiError('Could not download repository. Ensure it is public and the URL is correct.', 400);
    }

    return importFromZipBuffer(userId, projectName, archive.buffer, repoName);
  } catch (error) {
    return errorResponse(error);
  }
}

function parseGitHubRepoUrl(rawUrl: string): GitHubRepoRef | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    const [owner, repoPart, marker, ...branchParts] = parts;
    if (!owner || !repoPart) return null;

    const repoName = repoPart.replace(/\.git$/, '');
    const branch = marker === 'tree' && branchParts.length > 0
      ? branchParts.join('/')
      : 'main';

    return { owner, repoName, branch };
  } catch {
    return null;
  }
}

function githubArchiveUrl(owner: string, repoName: string, branch: string) {
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/archive/refs/heads/${encodedBranch}.zip`;
}

async function fetchGitHubArchive(
  owner: string,
  repoName: string,
  branch: string,
): Promise<ArchiveFetchResult> {
  try {
    const res = await fetch(githubArchiveUrl(owner, repoName, branch), {
      signal: AbortSignal.timeout(GITHUB_ARCHIVE_TIMEOUT_MS),
    });
    if (!res.ok) return { status: 'error' };

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > ZIP_IMPORT_LIMITS.MAX_ARCHIVE_BYTES) {
      return { status: 'too-large' };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > ZIP_IMPORT_LIMITS.MAX_ARCHIVE_BYTES) {
      return { status: 'too-large' };
    }

    return { status: 'ok', buffer };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : '';
    return errorName === 'TimeoutError' || errorName === 'AbortError'
      ? { status: 'timeout' }
      : { status: 'error' };
  }
}

function stripGitHubArchiveRoot(entryPath: string, repoName: string) {
  const [root, ...rest] = entryPath.split('/');
  if (root?.startsWith(`${repoName}-`) && rest.length > 0) {
    return rest.join('/');
  }
  return entryPath;
}

async function importFromZipBuffer(userId: string, projectName: string, buffer: Buffer, repoName: string) {
  const entries = parseZipTextEntries(buffer);
  const files: Array<{ path: string; content: string }> = [];
  for (const entry of entries) {
    const path = stripGitHubArchiveRoot(entry.path, repoName);
    if (path.startsWith('.') || path.includes('__MACOSX')) continue;
    if (!path || !isValidFilePath(path)) throw new ApiError(400, 'Invalid import path', 'INVALID_PATH');
    if (Buffer.byteLength(entry.content, 'utf8') > LIMITS.MAX_FILE_SIZE) {
      throw new ApiError(413, 'Imported file is too large', 'FILE_TOO_LARGE');
    }
    files.push({ path, content: entry.content });
  }
  const project = await createProjectWithTextFiles(userId, { name: projectName }, files);
  const importedCount = files.length;

  logAuditAction(userId, 'project.imported_url', 'project', project.id, { projectName, importedCount }).catch(() => {});

  return apiSuccess({ project, importedFiles: importedCount }, 201);
}
