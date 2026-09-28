import { describe, it, expect } from 'vitest';
import { resolveConnectionState } from '@/lib/connection-status';

describe('resolveConnectionState', () => {
  it('reports single-user mode when websockets are not configured', () => {
    const c = resolveConnectionState({ wsConfigured: false, browserOnline: true, providerStatus: 'connected' });
    expect(c.state).toBe('local');
    expect(c.banner).toBeNull();
    expect(c.syncing).toBe(false);
  });

  it('treats browser-offline as the dominant state (over provider status)', () => {
    const c = resolveConnectionState({ wsConfigured: true, browserOnline: false, providerStatus: 'connected' });
    expect(c.state).toBe('offline');
    expect(c.tone).toBe('warning');
    expect(c.banner).toMatch(/offline/i);
    expect(c.syncing).toBe(false);
  });

  it('does not show an offline banner in single-user mode even when the browser is offline', () => {
    const c = resolveConnectionState({ wsConfigured: false, browserOnline: false, providerStatus: null });
    expect(c.state).toBe('local');
    expect(c.banner).toBeNull();
  });

  it('reports connected + syncing with no banner', () => {
    const c = resolveConnectionState({ wsConfigured: true, browserOnline: true, providerStatus: 'connected' });
    expect(c.state).toBe('connected');
    expect(c.tone).toBe('positive');
    expect(c.banner).toBeNull();
    expect(c.syncing).toBe(true);
  });

  it('reports connecting on first connect / null status', () => {
    expect(resolveConnectionState({ wsConfigured: true, browserOnline: true, providerStatus: 'connecting' }).state).toBe('connecting');
    expect(resolveConnectionState({ wsConfigured: true, browserOnline: true, providerStatus: null }).state).toBe('connecting');
  });

  it('reports reconnecting (with a reassuring banner) when the provider is disconnected but the browser is online', () => {
    const c = resolveConnectionState({ wsConfigured: true, browserOnline: true, providerStatus: 'disconnected' });
    expect(c.state).toBe('reconnecting');
    expect(c.tone).toBe('warning');
    expect(c.banner).toMatch(/sync/i);
    expect(c.syncing).toBe(false);
  });
});
