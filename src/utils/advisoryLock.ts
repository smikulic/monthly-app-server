import type { PrismaClient } from "@prisma/client";

const LOCK_KEY_1 = 20250905; // 32-bit int
const LOCK_KEY_2 = 1; // 32-bit int

export async function tryLock(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT pg_try_advisory_lock(${LOCK_KEY_1}::int4, ${LOCK_KEY_2}::int4) AS ok
  `;
  return rows?.[0]?.ok === true;
}

export async function unlock(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`
    SELECT pg_advisory_unlock(${LOCK_KEY_1}::int4, ${LOCK_KEY_2}::int4)
  `;
}
