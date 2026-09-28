import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { upsertOAuthUser, verifyCredentials } from '@/services/user-service';
import { logAuditAction } from '@/services/audit-service';
import { loginSchema } from '@/lib/validation';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { RATE_LIMITS, SYSTEM_TARGET_ID } from '@/lib/constants';
import { getOAuthProviderConfig } from '@/lib/oauth-providers';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { createHash } from 'crypto';

import type { Account, Profile, User } from 'next-auth';
import type { Provider } from 'next-auth/providers';

function stringValue(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function profileValue(profile: Profile | undefined, key: string): string | null {
  return stringValue(profile?.[key]);
}

function isProviderAccount(account: Account | null | undefined): account is Account {
  return Boolean(account && account.type !== 'credentials');
}

function oauthEmail(user: User, profile?: Profile) {
  return stringValue(user.email) ?? stringValue(profile?.email);
}

function oauthName(user: User, profile?: Profile) {
  return stringValue(user.name) ?? stringValue(profile?.name) ?? profileValue(profile, 'login');
}

function oauthImage(user: User, profile?: Profile) {
  return stringValue(user.image) ?? stringValue(profile?.picture) ?? profileValue(profile, 'avatar_url');
}

function oauthProviderAccountId(account: Account, user: User, profile?: Profile) {
  return (
    stringValue(account.providerAccountId) ??
    stringValue(user.id) ??
    stringValue(profile?.sub) ??
    stringValue(profile?.id)
  );
}

const providers: Provider[] = [
  Credentials({
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials, request) {
      const parsed = loginSchema.safeParse(credentials);
      const ip = getClientIp(request.headers);
      const ipFingerprint = createHash('sha256').update(ip).digest('hex').slice(0, 16);
      if (!parsed.success) {
        logAuditAction(null, 'login.rate_limited', 'system', SYSTEM_TARGET_ID, {
          reason: 'invalid_payload',
          ipFingerprint,
          hasEmail: Boolean((credentials as { email?: string })?.email),
          hasPassword: Boolean((credentials as { password?: string })?.password),
        }).catch(() => {});
        return null;
      }

      const emailFingerprint = createHash('sha256')
        .update(parsed.data.email.toLowerCase())
        .digest('hex')
        .slice(0, 16);
      const email = parsed.data.email.toLowerCase();

      // Broad spray limit: blocks one IP from trying many different emails.
      const ipRateLimit = await checkRateLimit(
        `rate:login-ip:${ip}`,
        RATE_LIMITS.LOGIN_IP.limit,
        RATE_LIMITS.LOGIN_IP.windowSeconds,
      );
      if (!ipRateLimit.allowed) {
        logAuditAction(null, 'login.rate_limited', 'system', SYSTEM_TARGET_ID, {
          reason: 'ip',
          emailFingerprint,
          ipFingerprint,
        }).catch(() => {});
        return null;
      }

      // Rate limit login attempts: 10 per 5 minutes per email
      const rateLimitKey = `rate:login:${email}`;
      const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.LOGIN.limit, RATE_LIMITS.LOGIN.windowSeconds);
      if (!rateLimit.allowed) {
        logAuditAction(null, 'login.rate_limited', 'system', SYSTEM_TARGET_ID, {
          reason: 'email',
          emailFingerprint,
        }).catch(() => {});
        return null;
      }

      const user = await verifyCredentials(parsed.data.email, parsed.data.password);
      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    },
  }),
];

const oauthProviders = getOAuthProviderConfig();

// Conditionally add Google OAuth provider
if (oauthProviders.google) {
  providers.push(
    Google({
      clientId: oauthProviders.google.clientId,
      clientSecret: oauthProviders.google.clientSecret,
    }),
  );
}

// Conditionally add GitHub OAuth provider
if (oauthProviders.github) {
  providers.push(
    GitHub({
      clientId: oauthProviders.github.clientId,
      clientSecret: oauthProviders.github.clientSecret,
    }),
  );
}

const isProduction = env.isProduction;

export type { AppSessionUser } from '@/lib/session';
export { getAppUser } from '@/lib/session';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  basePath: '/api/v1/auth',
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  cookies: {
    sessionToken: {
      name: isProduction ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProduction,
      },
    },
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!isProviderAccount(account)) return true;
      return Boolean(oauthEmail(user, profile) && oauthProviderAccountId(account, user, profile));
    },
    async jwt({ token, user, trigger, account, profile }) {
      if (user && account && isProviderAccount(account)) {
        const appUser = await upsertOAuthUser({
          provider: account.provider,
          providerAccountId: oauthProviderAccountId(account, user, profile) ?? '',
          email: oauthEmail(user, profile),
          name: oauthName(user, profile),
          image: oauthImage(user, profile),
          accessToken: stringValue(account.access_token),
          refreshToken: stringValue(account.refresh_token),
          expiresAt: typeof account.expires_at === 'number' ? account.expires_at : null,
        });

        token.id = appUser.id;
        token.role = appUser.role;
        token.email = appUser.email;
        token.name = appUser.name;
        token.picture = appUser.avatarUrl ?? null;
        logAuditAction(appUser.id, 'oauth.login', 'user', appUser.id, { provider: account.provider }, appUser.email).catch(() => {});
      } else if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? 'user';
      }
      // DB check: runs on sign-in, explicit update, first load, or when the cached
      // token version is stale (re-checked every 5 minutes). Detects password changes
      // so sessions are invalidated within 5 minutes of a credential rotation.
      const now = Date.now();
      const pvAge = (token.pvCheckedAt as number | undefined) ?? 0;
      const versionCheckDue = (now - pvAge) > 5 * 60 * 1000;
      if (token.id && (user || trigger === 'update' || token.picture === undefined || versionCheckDue)) {
        try {
          const u = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { avatarUrl: true, name: true, tokenVersion: true },
          });
          if (!u) return null;
          const storedPv = token.pv as number | undefined;
          if (storedPv !== undefined && u.tokenVersion !== storedPv) return null;
          token.pv = u.tokenVersion;
          token.pvCheckedAt = now;
          token.picture = u.avatarUrl ?? null;
          if (u.name) token.name = u.name;
        } catch {
          // DB unavailable — keep prior values; don't invalidate on transient errors
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        if (token.picture !== undefined) {
          session.user.image = token.picture as string | null;
        }
      }
      return session;
    },
  },
});
