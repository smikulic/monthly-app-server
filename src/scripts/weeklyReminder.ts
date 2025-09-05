import "dotenv/config";
import cron from "node-cron";
import { PrismaClient, User } from "@prisma/client";
import { startOfWeek, endOfWeek } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
// IMPORTANT: use .js in specifier for ESM/ts-node mapping → dist will resolve fine
import { sendWeeklyReminderEmail } from "../helpers/emails.js";

const prisma = new PrismaClient();

const DEFAULT_TZ = "Europe/Zagreb";
const INTERVAL_CRON = "0 11 * * 6"; // Sat 11:00 by default

function getWeekBoundsUTC(tz: string) {
  const now = new Date();
  const zoned = toZonedTime(now, tz);
  const weekStartLocal = startOfWeek(zoned, { weekStartsOn: 1 }); // Monday
  const weekEndLocal = endOfWeek(zoned, { weekStartsOn: 1 }); // Sunday
  const gte = fromZonedTime(weekStartLocal, tz);
  const lte = fromZonedTime(weekEndLocal, tz);
  return { gte, lte, weekStartLocal, weekEndLocal, zonedNow: zoned };
}

// integer money formatting
function money(amount: number, currency?: string | null, locale = "en-GB") {
  const cur = currency ?? "EUR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

// Subcategory.budgetAmount is MONTHLY integer units; weekly ≈ monthly/4
async function weeklyBudget(userId: string) {
  const subcats = await prisma.subcategory.findMany({
    where: { category: { userId } },
    select: { budgetAmount: true },
  });
  const monthlyTotal = subcats.reduce((s, r) => s + (r.budgetAmount || 0), 0);
  return Math.round(monthlyTotal / 4);
}

async function weeklySpend(userId: string, gte: Date, lte: Date) {
  const agg = await prisma.expense.aggregate({
    where: { userId, date: { gte, lte } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

async function processUser(user: User) {
  const tz = DEFAULT_TZ;
  const { gte, lte, weekStartLocal, weekEndLocal, zonedNow } =
    getWeekBoundsUTC(tz);

  const [spend, budget] = await Promise.all([
    weeklySpend(user.id, gte, lte),
    weeklyBudget(user.id),
  ]);

  const left = Math.max(budget - spend, 0);
  const endForLabel =
    weekEndLocal.getTime() < zonedNow.getTime() ? weekEndLocal : zonedNow;

  const weekRange = `${formatInTimeZone(
    weekStartLocal,
    tz,
    "d LLL"
  )} – ${formatInTimeZone(endForLabel, tz, "d LLL, yyyy")}`;

  const model = {
    week_range: weekRange,
    total_spent: money(spend, user.currency),
    budget_left: money(left, user.currency),
    total_budget_week: money(budget, user.currency),
  };

  await sendWeeklyReminderEmail(user, model);
}

async function runTickPIISafeSummary() {
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
      const u = users[i] as User;
      try {
        await processUser(u);
        emailed++;
      } catch (e) {
        failed++;
        // PII-safe: do not log email or user id
        console.error("[weekly-reminder] send failed for a user", {
          index: i + 1, // sequence number within this tick
          error: (e as Error)?.message ?? e,
        });
      }
    }

    console.log("[weekly-reminder] tick summary", {
      eligible: total,
      emailed,
      failed,
      ts: new Date().toISOString(),
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Re-entrancy guard (don’t overlap ticks)
let isRunning = false;

cron.schedule(
  INTERVAL_CRON,
  async () => {
    if (isRunning) {
      console.log("[weekly-reminder] previous tick still running — skipping.");
      return;
    }
    isRunning = true;
    console.log("[weekly-reminder] tick start", {
      tz: DEFAULT_TZ,
      cron: INTERVAL_CRON,
      ts: new Date().toISOString(),
    });
    try {
      await runTickPIISafeSummary();
    } catch (e) {
      console.error("[weekly-reminder] tick error", {
        error: (e as Error)?.message ?? e,
      });
    } finally {
      isRunning = false;
      console.log("[weekly-reminder] tick end", {
        ts: new Date().toISOString(),
      });
    }
  },
  { timezone: DEFAULT_TZ }
);

// graceful shutdown
const shutdown = async (sig: string) => {
  console.log(`[weekly-reminder] ${sig} received — shutting down.`);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log("[weekly-reminder] worker started", {
  tz: DEFAULT_TZ,
  cron: INTERVAL_CRON,
});
