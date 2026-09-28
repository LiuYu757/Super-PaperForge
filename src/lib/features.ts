import { env } from '@/lib/env';
import { ApiError } from '@/lib/errors';

/**
 * Server-side feature gating for self-hosted deployments.
 *
 * The rule from the self-hosting spec: **disabling a feature must take effect on
 * the server, not just hide a button.** Route handlers call `assertFeature()` so
 * a disabled surface returns 404 even if a client crafts the request by hand.
 *
 * Gating is deliberately separate from authentication and authorisation. Turning
 * off billing or public signup must never weaken login, project roles, rate
 * limits or storage quotas — those stay active in every mode.
 */

export type Feature =
  | 'internalAi'
  | 'publicSignup'
  | 'publicSharing'
  | 'billing'
  | 'growthAnalytics'
  | 'remoteGitImport'
  | 'externalApply';

const FEATURE_ENV: Record<Feature, () => boolean> = {
  internalAi: () => env.ENABLE_INTERNAL_AI,
  publicSignup: () => env.ENABLE_PUBLIC_SIGNUP,
  publicSharing: () => env.ENABLE_PUBLIC_SHARING,
  billing: () => env.ENABLE_BILLING,
  growthAnalytics: () => env.ENABLE_GROWTH_ANALYTICS,
  remoteGitImport: () => env.ENABLE_REMOTE_GIT_IMPORT,
  // External live writes are gated behind a dedicated switch so a selfhost
  // operator can choose to expose the changeset apply/revert endpoints only
  // after upgrading the editor to the versioned protocol (PR-1).
  externalApply: () => env.ENABLE_EXTERNAL_APPLY,
};

/** Whether a feature is enabled in the current deployment mode. */
export function isFeatureEnabled(feature: Feature): boolean {
  return FEATURE_ENV[feature]();
}

/**
 * Throws `ApiError(404)` when the feature is disabled.
 *
 * 404 rather than 403 is intentional: a disabled surface should be
 * indistinguishable from one that was never deployed, so probing a selfhost
 * instance does not reveal which SaaS modules exist upstream.
 */
export function assertFeature(feature: Feature): void {
  if (!isFeatureEnabled(feature)) {
    throw new ApiError(404, 'Not found');
  }
}

/**
 * True when the paper may be sent to a third-party compilation service.
 *
 * Both conditions must hold: the backend must not be pinned to `local`, and
 * remote compilation must be allowed. Self-hosted deployments fail both by
 * default, so an unconfigured Redis degrades to a visible error instead of
 * silently uploading the manuscript off-box.
 */
export function isRemoteCompileAllowed(): boolean {
  return env.COMPILATION_BACKEND !== 'local' && env.ALLOW_REMOTE_COMPILE;
}
