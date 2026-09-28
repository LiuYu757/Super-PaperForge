import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client/client';
import { env } from './env';

const prisma = new PrismaClient({ adapter: new PrismaPg(env.DATABASE_URL) });

export async function getProjectRole(projectId: string, userId: string): Promise<string | null> {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return member?.role || null;
}
