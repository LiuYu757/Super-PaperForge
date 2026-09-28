/**
 * Persists activation funnel markers (first-reached milestone timestamps) on the
 * user settings blob. Designed to be called fire-and-forget from milestone hooks
 * (project creation, email verification, …): it is idempotent and never throws
 * for a missing user, so it can't break the primary operation.
 */
import { prisma } from '@/lib/prisma';
import {
  withActivationEvent,
  type ActivationEventId,
} from '@/lib/activation-events';

/**
 * Record that a user reached an activation milestone. Returns true if a new
 * marker was written, false if it already existed or the user was not found.
 */
export async function recordActivationEvent(
  userId: string,
  eventId: ActivationEventId,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  if (!user) return false;

  const { settings, changed } = withActivationEvent(
    user.settings,
    eventId,
    new Date().toISOString(),
  );
  if (!changed) return false;

  // Mirror the admin-route pattern: pass the JSON settings blob through a loosely
  // typed data object so Prisma's strict InputJsonValue type is satisfied.
  const data: Record<string, unknown> = { settings };
  await prisma.user.update({ where: { id: userId }, data });
  return true;
}
