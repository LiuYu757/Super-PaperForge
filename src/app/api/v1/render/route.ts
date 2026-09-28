import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/errors';
import { apiError } from '@/lib/api-response';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { RATE_LIMITS, SYSTEM_TARGET_ID } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';
import { createHash } from 'crypto';

const renderSchema = z.object({
  latex: z.string().min(1).max(5000),
  displayMode: z.boolean().default(true),
});

/**
 * POST /api/v1/render
 * Render LaTeX to HTML string using KaTeX (server-side).
 * Returns HTML that can be used for screenshots or embedding.
 * No auth required — public API for sharing.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const limited = await enforceRateLimit(`rate:render:${ip}`, RATE_LIMITS.RENDER);
    if (limited) return limited;

    const body = await request.json();
    const { latex, displayMode } = renderSchema.parse(body);

    // Dynamic import KaTeX for server-side rendering
    const katex = await import('katex');

    const html = katex.default.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: false,
    });

    const requestFingerprint = createHash('sha256')
      .update(`${ip}::render`)
      .digest('hex')
      .slice(0, 16);
    logAuditAction(null, 'rendered', 'system', SYSTEM_TARGET_ID, {
      ipFingerprint: requestFingerprint,
      latexLength: latex.length,
    }).catch(() => {});

    // Return full HTML page for screenshot/embedding
    const fullPage = `<!DOCTYPE html>
<html>
<head>
<style>
body { margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: white; font-size: 20px; }
.dark body { background: #0a0a0a; color: white; }
code, .katex { white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>${html}</body>
</html>`;

    return new NextResponse(fullPage, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('Invalid LaTeX input', 400);
    }
    return errorResponse(error);
  }
}
