import { env } from './env';

export type OAuthProviderId = 'google' | 'github';

export interface OAuthProviderConfig {
  google?: { clientId: string; clientSecret: string };
  github?: { clientId: string; clientSecret: string };
}

function readPair(primaryId: string, primarySecret: string) {
  const legacyLookup = (key: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET') => {
    const map = {
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
      GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
    };
    return map[key] || '';
  };

  const clientId =
    primaryId === 'AUTH_GOOGLE_ID'
      ? env.AUTH_GOOGLE_ID || legacyLookup('GOOGLE_CLIENT_ID')
      : primaryId === 'AUTH_GITHUB_ID'
        ? env.AUTH_GITHUB_ID || legacyLookup('GITHUB_CLIENT_ID')
        : '';

  const clientSecret =
    primarySecret === 'AUTH_GOOGLE_SECRET'
      ? env.AUTH_GOOGLE_SECRET || legacyLookup('GOOGLE_CLIENT_SECRET')
      : primarySecret === 'AUTH_GITHUB_SECRET'
        ? env.AUTH_GITHUB_SECRET || legacyLookup('GITHUB_CLIENT_SECRET')
        : '';

  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

export function getOAuthProviderConfig(): OAuthProviderConfig {
  return {
    google: readPair('AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'),
    github: readPair('AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET'),
  };
}

export function getEnabledOAuthProviders(): OAuthProviderId[] {
  const providers = getOAuthProviderConfig();
  return (Object.keys(providers) as OAuthProviderId[]).filter((provider) => providers[provider]);
}
