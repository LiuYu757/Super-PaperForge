/**
 * Persisted activation markers. The activation checklist (src/lib/activation.ts)
 * derives current state live from projects/storage; these markers instead record
 * the *first time* a user reached each milestone, as ISO timestamps under
 * `settings.activationEvents`. That gives a durable activation-funnel record
 * (first project, first collaborator, verified email, …) for analytics and for
 * one-shot side effects like the welcome email — independent of whether the
 * underlying project later gets deleted.
 *
 * Pure module (no IO) so the merge logic is unit-testable; the service layer
 * reads/writes settings.
 */

export const ACTIVATION_EVENT_IDS = [
  'verified_email',
  'created_project',
  'added_content',
  'invited_collaborator',
  'reviewed_billing',
] as const;

export type ActivationEventId = (typeof ACTIVATION_EVENT_IDS)[number];

export function isActivationEventId(value: unknown): value is ActivationEventId {
  return typeof value === 'string' && (ACTIVATION_EVENT_IDS as readonly string[]).includes(value);
}

function settingsRecord(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  return { ...(settings as Record<string, unknown>) };
}

/** Extract the marker map, keeping only known ids with string timestamps. */
export function getActivationEvents(settings: unknown): Partial<Record<ActivationEventId, string>> {
  const raw = settingsRecord(settings).activationEvents;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Partial<Record<ActivationEventId, string>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isActivationEventId(key) && typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Merge a milestone marker into settings. First-reached wins (idempotent): a
 * marker that already exists is left untouched and `changed` is false, so the
 * caller can skip the write.
 */
export function withActivationEvent(
  settings: unknown,
  eventId: ActivationEventId,
  atIso: string,
): { settings: Record<string, unknown>; changed: boolean } {
  const next = settingsRecord(settings);
  const events = { ...getActivationEvents(settings) };

  if (events[eventId]) {
    return { settings: { ...next, activationEvents: events }, changed: false };
  }

  events[eventId] = atIso;
  return { settings: { ...next, activationEvents: events }, changed: true };
}
