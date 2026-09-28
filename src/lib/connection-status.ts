/**
 * Pure mapping from raw collaboration-connection inputs to a user-facing
 * connection state (label, tone, banner). Kept IO-free so the editor's
 * reconnect/offline UX is unit-testable; the editor wires browser online state
 * and the y-websocket provider status into it.
 *
 * Throughout, edits are never lost while disconnected — Yjs holds them locally
 * and syncs on reconnect — so the copy reassures rather than alarms.
 */

export type ProviderStatus = 'connected' | 'connecting' | 'disconnected';
export type ConnectionState = 'local' | 'connected' | 'connecting' | 'reconnecting' | 'offline';
export type ConnectionTone = 'positive' | 'pending' | 'warning' | 'neutral';

export interface ConnectionDisplay {
  state: ConnectionState;
  label: string;
  tone: ConnectionTone;
  /** Inline banner text, or null when no banner should show. */
  banner: string | null;
  /** Whether edits are currently propagating to collaborators. */
  syncing: boolean;
}

export function resolveConnectionState(input: {
  wsConfigured: boolean;
  browserOnline: boolean;
  providerStatus: ProviderStatus | null;
}): ConnectionDisplay {
  // Single-user mode: no collaboration server, so connection state is moot.
  if (!input.wsConfigured) {
    return { state: 'local', label: 'Single-user', tone: 'neutral', banner: null, syncing: false };
  }

  // Browser offline dominates — nothing can reach the server regardless of the
  // last provider status.
  if (!input.browserOnline) {
    return {
      state: 'offline',
      label: 'Offline',
      tone: 'warning',
      banner:
        'You are offline. Changes are saved locally and will sync when your connection is restored.',
      syncing: false,
    };
  }

  switch (input.providerStatus) {
    case 'connected':
      return { state: 'connected', label: 'Connected', tone: 'positive', banner: null, syncing: true };
    case 'disconnected':
      return {
        state: 'reconnecting',
        label: 'Reconnecting…',
        tone: 'warning',
        banner: 'Connection lost. Reconnecting… your changes are saved locally and will sync.',
        syncing: false,
      };
    case 'connecting':
    case null:
    default:
      return {
        state: 'connecting',
        label: 'Connecting…',
        tone: 'pending',
        banner: 'Connecting to the collaboration server…',
        syncing: false,
      };
  }
}
