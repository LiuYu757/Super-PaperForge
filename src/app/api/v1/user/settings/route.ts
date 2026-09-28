import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { logAuditAction } from '@/services/audit-service';

export const dynamic = 'force-dynamic';

// Whitelist of allowed settings keys to prevent prototype pollution
const ALLOWED_SETTINGS_KEYS = new Set([
  'theme', 'fontSize', 'fontFamily', 'lineHeight', 'wordWrap',
  'showLineNumbers', 'editorMode', 'language', 'autoCompile',
  'spellcheck', 'notifications', 'compactMode', 'sidebarWidth',
]);

const settingValueSchema = z.union([
  z.string().max(200),
  z.number().int().min(1).max(200),
  z.boolean(),
]);

const patchSettingsSchema = z.object({
  settings: z.record(z.string(), settingValueSchema),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    return apiSuccess({ settings: user?.settings ?? {} });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return ApiErrors.unauthorized();
    const userId = (session.user as { id: string }).id;

    const limited = await enforceRateLimit(`rate:settings-update:${userId}`, RATE_LIMITS.SETTINGS_UPDATE);
    if (limited) return limited;

    const body = await request.json();
    const { settings: incoming } = patchSettingsSchema.parse(body);

    // Sanitize: only allow whitelisted keys, block prototype pollution vectors
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (ALLOWED_SETTINGS_KEYS.has(key) && !key.startsWith('__') && key !== 'constructor') {
        sanitized[key] = value;
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    const current =
      user?.settings && typeof user.settings === 'object' && !Array.isArray(user.settings)
        ? (user.settings as Record<string, unknown>)
        : {};

    const merged = { ...current, ...sanitized };

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { settings: JSON.parse(JSON.stringify(merged)) },
      select: { settings: true },
    });

    logAuditAction(userId, 'settings.updated', 'user', userId, {
      keys: Object.keys(sanitized),
      hasSensitiveKeys:
        Object.keys(sanitized).some((key) => ['notifications', 'language', 'autoCompile'].includes(key)),
    }).catch(() => {});

    return apiSuccess({ settings: updated.settings });
  } catch (error) {
    return errorResponse(error);
  }
}
