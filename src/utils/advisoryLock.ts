import type { PrismaClient } from "@prisma/client";

// Pick any two 32-bit integers. Change if you add more jobs later.
const LOCK_KEY_1 = 20250905;
const LOCK_KEY_2 = 1;

export async function tryLock(prisma: PrismaClient): Promise<boolean> {
  const res = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
    SELECT pg_try_advisory_lock(${LOCK_KEY_1}, ${LOCK_KEY_2})
  `;
  return !!res?.[0]?.pg_try_advisory_lock;
}

export async function unlock(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRawUnsafe(
    `SELECT pg_advisory_unlock($1, $2)`,
    LOCK_KEY_1,
    LOCK_KEY_2
  );
}
