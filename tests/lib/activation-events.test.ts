import { describe, it, expect } from 'vitest';
import {
  isActivationEventId,
  withActivationEvent,
  getActivationEvents,
  ACTIVATION_EVENT_IDS,
} from '@/lib/activation-events';

const T1 = '2026-06-23T10:00:00.000Z';
const T2 = '2026-06-23T11:00:00.000Z';

describe('isActivationEventId', () => {
  it('accepts known ids and rejects others', () => {
    expect(isActivationEventId('created_project')).toBe(true);
    expect(isActivationEventId('verified_email')).toBe(true);
    expect(isActivationEventId('nope')).toBe(false);
    expect(isActivationEventId(123)).toBe(false);
  });

  it('exposes a stable set of event ids', () => {
    expect(ACTIVATION_EVENT_IDS).toContain('created_project');
    expect(ACTIVATION_EVENT_IDS).toContain('invited_collaborator');
  });
});

describe('withActivationEvent', () => {
  it('records a marker under settings.activationEvents and reports changed', () => {
    const { settings, changed } = withActivationEvent({}, 'created_project', T1);
    expect(changed).toBe(true);
    expect((settings.activationEvents as Record<string, string>).created_project).toBe(T1);
  });

  it('is idempotent — first-reached timestamp wins, no change on repeat', () => {
    const first = withActivationEvent({}, 'created_project', T1);
    const second = withActivationEvent(first.settings, 'created_project', T2);
    expect(second.changed).toBe(false);
    expect((second.settings.activationEvents as Record<string, string>).created_project).toBe(T1);
  });

  it('preserves unrelated settings keys and earlier markers', () => {
    const start = { theme: 'dark', billingPlan: 'pro', activationEvents: { verified_email: T1 } };
    const { settings, changed } = withActivationEvent(start, 'created_project', T2);
    expect(changed).toBe(true);
    expect(settings.theme).toBe('dark');
    expect(settings.billingPlan).toBe('pro');
    expect(settings.activationEvents).toEqual({ verified_email: T1, created_project: T2 });
  });

  it('treats a null/garbage settings blob as empty', () => {
    expect(withActivationEvent(null, 'created_project', T1).changed).toBe(true);
    expect(withActivationEvent('garbage', 'created_project', T1).settings.activationEvents).toEqual({
      created_project: T1,
    });
  });
});

describe('getActivationEvents', () => {
  it('returns the marker map', () => {
    const settings = { activationEvents: { verified_email: T1, created_project: T2 } };
    expect(getActivationEvents(settings)).toEqual({ verified_email: T1, created_project: T2 });
  });

  it('returns an empty object when there are no markers', () => {
    expect(getActivationEvents(null)).toEqual({});
    expect(getActivationEvents({ theme: 'dark' })).toEqual({});
  });

  it('ignores non-string / unknown marker entries', () => {
    const settings = { activationEvents: { verified_email: T1, bogus: 5, junk: 'x' } };
    expect(getActivationEvents(settings)).toEqual({ verified_email: T1 });
  });
});
