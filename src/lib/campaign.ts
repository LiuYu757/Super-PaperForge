/**
 * Campaign attribution capture. Parses utm_* / referrer hints supplied at
 * registration and stores a sanitized, first-touch record under
 * `settings.attribution` for the growth funnel (which channel converts).
 *
 * Pure module (no IO) so parsing/merge logic is unit-testable; the service
 * layer persists it.
 */

export interface CampaignAttribution {
  source?: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
}

export interface StoredCampaignAttribution extends CampaignAttribution {
  capturedAt: string;
}

const MAX_LEN = 120;

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_LEN);
  if (!trimmed) return undefined;
  // Reject control chars and whitespace-containing tokens (utm values are slugs).
  if (/[\x00-\x1f]/.test(trimmed)) return undefined;
  if (/\s/.test(trimmed)) return undefined;
  return trimmed;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Build a sanitized attribution object from raw input (utm_* or short aliases),
 * or null if nothing usable is present.
 */
export function parseCampaignAttribution(input: unknown): CampaignAttribution | null {
  const raw = record(input);
  const result: CampaignAttribution = {};
  const source = clean(raw.utm_source ?? raw.source);
  const medium = clean(raw.utm_medium ?? raw.medium);
  const campaign = clean(raw.utm_campaign ?? raw.campaign);
  const referrer = clean(raw.ref ?? raw.referrer);

  if (source) result.source = source;
  if (medium) result.medium = medium;
  if (campaign) result.campaign = campaign;
  if (referrer) result.referrer = referrer;

  return Object.keys(result).length > 0 ? result : null;
}

export function getCampaignAttribution(settings: unknown): StoredCampaignAttribution | null {
  const raw = record(settings).attribution;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as StoredCampaignAttribution;
}

/**
 * Merge attribution into settings. First-touch wins: an existing attribution is
 * never overwritten (the channel that first acquired the user is the one that
 * gets credit), so `changed` is false and the caller can skip the write.
 */
export function withCampaignAttribution(
  settings: unknown,
  attribution: CampaignAttribution,
  atIso: string,
): { settings: Record<string, unknown>; changed: boolean } {
  const next = { ...record(settings) };
  if (getCampaignAttribution(settings)) {
    return { settings: next, changed: false };
  }
  next.attribution = { ...attribution, capturedAt: atIso };
  return { settings: next, changed: true };
}
