/**
 * Persists first-touch campaign attribution on the user settings blob. Called
 * fire-and-forget from registration: idempotent, never throws for a missing
 * user, and a no-op when no usable attribution is present.
 */
import { prisma } from '@/lib/prisma';
import {
  parseCampaignAttribution,
  withCampaignAttribution,
} from '@/lib/campaign';

/**
 * Record campaign attribution for a user from raw registration input. Returns
 * true if a new attribution record was written.
 */
export async function recordCampaignAttribution(
  userId: string,
  raw: unknown,
): Promise<boolean> {
  const attribution = parseCampaignAttribution(raw);
  if (!attribution) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  if (!user) return false;

  const { settings, changed } = withCampaignAttribution(
    user.settings,
    attribution,
    new Date().toISOString(),
  );
  if (!changed) return false;

  const data: Record<string, unknown> = { settings };
  await prisma.user.update({ where: { id: userId }, data });
  return true;
}
