import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { apiSuccess, apiError, ApiErrors } from '@/lib/api-response';
import { checkRateLimit, enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { RATE_LIMITS } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { aiHourlyRateLimit, getEntitledPlan } from '@/lib/entitlements';
import { logAuditAction } from '@/services/audit-service';
import { assertFeature } from '@/lib/features';

export const dynamic = 'force-dynamic';

const assistSchema = z.object({
  prompt: z.string().min(1).max(2000),
  context: z.string().max(5000).optional(),
  mode: z.enum(['fix', 'explain', 'complete', 'convert']).default('complete'),
});

/**
 * POST /api/v1/ai/assist
 * AI-powered LaTeX assistant. Requires ANTHROPIC_API_KEY env var.
 */
export async function POST(request: NextRequest) {
  try {
    assertFeature('internalAi');
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    // Per-user cap — cheap, blocks the noisy individual first so the
    // global slot is preserved for everyone else. The hourly allowance is
    // plan-aware: paid plans get a larger AI budget than Free.
    const aiUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true, storageQuotaBytes: true },
    });
    const userLimit = await enforceRateLimit(
      `rate:ai:user:${userId}`,
      aiHourlyRateLimit(getEntitledPlan(aiUser ?? {})),
      'AI request limit reached. Try again later.',
    );
    if (userLimit) {
      return userLimit;
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return apiError('AI assistant not configured. Set ANTHROPIC_API_KEY.', 503, 'AI_UNAVAILABLE');
    }

    const body = await request.json();
    const { prompt, context, mode } = assistSchema.parse(body);

    // Deployment-wide cap, checked just before the paid fetch so the
    // global counter increments only for requests that would otherwise
    // bill Anthropic.
    const globalLimit = await checkRateLimit(
      'rate:ai:global',
      RATE_LIMITS.AI_GLOBAL.limit,
      RATE_LIMITS.AI_GLOBAL.windowSeconds,
    );
    if (!globalLimit.allowed) {
      const limited = apiError(
        'AI assistant is temporarily unavailable due to high demand. Try again later.',
        503,
        'AI_OVERLOADED',
      );
      Object.entries(rateLimitHeaders(RATE_LIMITS.AI_GLOBAL.limit, globalLimit)).forEach(([k, v]) => {
        limited.headers.set(k, v);
      });
      return limited;
    }

    const systemPrompt = getSystemPrompt(mode);
    const userMessage = context
      ? `Context (current LaTeX code):\n\`\`\`latex\n${context}\n\`\`\`\n\nRequest: ${prompt}`
      : prompt;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return apiError('AI service temporarily unavailable', 502, 'AI_ERROR');
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';

    logAuditAction(userId, 'ai.assist', 'user', userId, {
      mode,
      model: 'claude-haiku-4-5-20251001',
      promptLength: prompt.length,
      contextLength: context?.length ?? 0,
      resultLength: text.length,
    }).catch((err) => console.error('[ai-assist] audit log failed:', err));

    return apiSuccess({ result: text, mode });
  } catch (error) {
    return errorResponse(error);
  }
}

function getSystemPrompt(mode: string): string {
  const base = 'You are a LaTeX expert assistant for PaperForge, a collaborative LaTeX editor. Respond concisely.';
  switch (mode) {
    case 'fix':
      return `${base} Fix LaTeX errors in the provided code. Return only the corrected LaTeX code without explanation.`;
    case 'explain':
      return `${base} Explain the LaTeX code or error in 2-3 sentences. Be clear and helpful for students.`;
    case 'complete':
      return `${base} Complete or extend the LaTeX code based on the request. Return only LaTeX code.`;
    case 'convert':
      return `${base} Convert the text/description into proper LaTeX code. Return only the LaTeX output.`;
    default:
      return base;
  }
}
