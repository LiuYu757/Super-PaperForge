/**
 * Seed demo account for testing.
 * Run: npx tsx prisma/seed-demo.ts
 *
 * Creates:
 *   Email: demo@paperforge.dev
 *   Password: Demo1234!
 */
import { PrismaClient } from '../src/generated/prisma/client/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@paperforge.dev';
  const password = 'Demo1234!';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Demo User',
      passwordHash,
      emailVerified: true,
      role: 'user',
      institution: 'PaperForge Demo',
      bio: 'This is a demo account for testing PaperForge.',
    },
  });

  console.log(`✓ Demo account ready:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  User ID:  ${user.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
