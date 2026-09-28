import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { ApiError } from '@/lib/errors';
import { AUTH } from '@/lib/constants';
import { encrypt } from '@/lib/encryption';
import { logAuditAction } from '@/services/audit-service';

const userSessionSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
} as const;

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function sanitizeDisplayName(name: string | null | undefined, email: string) {
  const normalized = name?.trim();
  return normalized || email.split('@')[0] || 'User';
}

function oauthTokenData(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
}) {
  const data: {
    encryptedAccessToken?: string;
    encryptedRefreshToken?: string;
    expiresAt?: Date;
  } = {};

  if (input.accessToken) data.encryptedAccessToken = encrypt(input.accessToken);
  if (input.refreshToken) data.encryptedRefreshToken = encrypt(input.refreshToken);
  if (input.expiresAt) data.expiresAt = new Date(input.expiresAt * 1000);

  return data;
}

export async function createUser(email: string, name: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.create({
    data: { email, name, passwordHash },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
}

// Precomputed dummy hash for constant-time response when user doesn't exist
const DUMMY_HASH = '$2a$12$LJ3m4ys3Lg2JFMg.Vy1GNe8dOJGCqW2Yqz8Hb7MxFZLkXQdKLWy6';

export async function verifyCredentials(email: string, password: string) {
  // Explicit select: omit large/unused columns and ensure we don't accidentally
  // start serializing the password hash elsewhere if this return ever widens.
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      lockedUntil: true,
      failedLoginAttempts: true,
    },
  });

  // Always perform bcrypt compare to prevent timing-based user enumeration
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    logAuditAction(user.id, 'login.blocked', 'user', user.id, undefined, user.email).catch(() => {});
    throw new ApiError(423, 'Account temporarily locked. Try again later or reset password.');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const update: Record<string, unknown> = { failedLoginAttempts: attempts };
    if (attempts >= AUTH.MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = new Date(Date.now() + AUTH.LOCKOUT_DURATION_MS);
    }
    await prisma.user.update({ where: { id: user.id }, data: update });
    logAuditAction(user.id, 'login.failed', 'user', user.id, undefined, user.email).catch(() => {});
    return null;
  }

  if (user.failedLoginAttempts > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  logAuditAction(user.id, 'login', 'user', user.id, undefined, user.email).catch(() => {});
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export interface OAuthUserInput {
  provider: string;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
}

export async function upsertOAuthUser(input: OAuthUserInput) {
  const provider = input.provider.trim().toLowerCase();
  const providerAccountId = input.providerAccountId.trim();
  const email = normalizeEmail(input.email);

  if (!provider || !providerAccountId) {
    throw new ApiError(400, 'OAuth provider did not return an account identifier');
  }
  if (!email) {
    throw new ApiError(400, 'OAuth provider did not return an email address');
  }

  const name = sanitizeDisplayName(input.name, email);
  const avatarUrl = input.image?.trim() || null;
  const tokenData = oauthTokenData(input);

  return prisma.$transaction(async (tx) => {
    const existingAccount = await tx.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId },
      },
      include: {
        user: { select: userSessionSelect },
      },
    });

    if (existingAccount) {
      if (Object.keys(tokenData).length > 0) {
        await tx.oAuthAccount.update({
          where: { id: existingAccount.id },
          data: tokenData,
        });
      }

      if (avatarUrl && existingAccount.user.avatarUrl !== avatarUrl) {
        return tx.user.update({
          where: { id: existingAccount.userId },
          data: { avatarUrl },
          select: userSessionSelect,
        });
      }

      return existingAccount.user;
    }

    const user = await tx.user.upsert({
      where: { email },
      update: {
        emailVerified: true,
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      create: {
        email,
        name,
        passwordHash: null,
        avatarUrl,
        emailVerified: true,
      },
      select: userSessionSelect,
    });

    await tx.oAuthAccount.create({
      data: {
        userId: user.id,
        provider,
        providerAccountId,
        ...tokenData,
      },
    });

    return user;
  });
}
