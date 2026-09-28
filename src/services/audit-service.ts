import { prisma } from '@/lib/prisma';

async function resolveActorEmail(adminId: string, actorEmail?: string) {
  if (actorEmail !== undefined) return actorEmail;
  try {
    const actor = await prisma.user.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    return actor?.email;
  } catch {
    return undefined;
  }
}

export async function logAuditAction(
  adminId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>,
  actorEmail?: string,
) {
  if (adminId === null) {
    return prisma.auditLog.create({
      data: {
        action,
        targetType,
        targetId,
        actorEmail: actorEmail ?? undefined,
        details: details ? JSON.parse(JSON.stringify(details)) : undefined,
      },
    });
  }

  const resolvedActorEmail = await resolveActorEmail(adminId, actorEmail);

  return prisma.auditLog.create({
    data: {
      adminId,
      actorEmail: resolvedActorEmail ?? undefined,
      action,
      targetType,
      targetId,
      details: details ? JSON.parse(JSON.stringify(details)) : undefined,
    },
  });
}

export async function getAuditLog(page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        details: true,
        createdAt: true,
        actorEmail: true,
        admin: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count(),
  ]);
  return { entries, total, page, limit };
}
