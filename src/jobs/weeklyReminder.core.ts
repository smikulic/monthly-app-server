import type { PrismaClient, User } from "@prisma/client";
import { startOfWeek, endOfWeek } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { sendWeeklyReminderEmail } from "../helpers/emails.js";

const DEFAULT_TZ = process.env.DEFAULT_TZ || "Europe/Zagreb";

function getWeekBoundsUTC(tz: string) {
  const now = new Date();
  const zoned = toZonedTime(now, tz);
  const weekStartLocal = startOfWeek(zoned, { weekStartsOn: 1 }); // Mon
  const weekEndLocal = endOfWeek(zoned, { weekStartsOn: 1 }); // Sun
  const gte = fromZonedTime(weekStartLocal, tz);
  const lte = fromZonedTime(weekEndLocal, tz);
  return { gte, lte, weekStartLocal, weekEndLocal, zonedNow: zoned };
}

function money(amount: number, currency?: string | null, locale = "en-GB") {
  const cur = currency ?? "EUR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

// Your current rule: weekly ≈ monthly / 4 (integer)
async function weeklyBudget(prisma: PrismaClient, userId: string) {
  const subcats = await prisma.subcategory.findMany({
    where: { category: { userId } },
    select: { budgetAmount: true },
  });
  const monthly = subcats.reduce((s, r) => s + (r.budgetAmount || 0), 0);
  return Math.round(monthly / 4);
}

async function weeklySpend(
  prisma: PrismaClient,
  userId: string,
  gte: Date,
  lte: Date
) {
  const agg = await prisma.expense.aggregate({
    where: { userId, date: { gte, lte } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

async function processUser(prisma: PrismaClient, user: User) {
  const { gte, lte, weekStartLocal, weekEndLocal, zonedNow } =
    getWeekBoundsUTC(DEFAULT_TZ);

  const [spend, budget] = await Promise.all([
    weeklySpend(prisma, user.id, gte, lte),
    weeklyBudget(prisma, user.id),
  ]);

  const left = Math.max(budget - spend, 0);
  const endForLabel =
    weekEndLocal.getTime() < zonedNow.getTime() ? weekEndLocal : zonedNow;

  const weekRange = `${formatInTimeZone(
    weekStartLocal,
    DEFAULT_TZ,
    "d LLL"
  )} – ${formatInTimeZone(endForLabel, DEFAULT_TZ, "d LLL, yyyy")}`;

  const model = {
    week_range: weekRange,
    total_spent: money(spend, user.currency),
    budget_left: money(left, user.currency),
    total_budget_week: money(budget, user.currency),
  };

  await sendWeeklyReminderEmail(user, model);
}

export async function sendAllWeeklyReminders(prisma: PrismaClient) {
  await prisma.$connect();
  let total = 0,
    emailed = 0,
    failed = 0;

  try {
    const users = await prisma.user.findMany({
      where: { emailConfirmed: true, weeklyReminder: true },
      select: { id: true, email: true },
      orderBy: { id: "asc" },
    });

    total = users.length;

    for (let i = 0; i < users.length; i++) {
      try {
        await processUser(prisma, users[i] as User);
        emailed++;
      } catch (e) {
        failed++;
        // PII-safe logs
        console.error("[weekly-reminder] send failed for a user", {
          index: i + 1,
          error: (e as Error)?.message ?? String(e),
        });
      }
    }

    console.log("[weekly-reminder] summary", {
      eligible: total,
      emailed,
      failed,
      ts: new Date().toISOString(),
    });
  } finally {
    await prisma.$disconnect();
  }
}
