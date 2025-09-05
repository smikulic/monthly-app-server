import "dotenv/config";
import cron, { ScheduledTask } from "node-cron";
import { PrismaClient, User } from "@prisma/client";
import { startOfWeek, endOfWeek } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
// @ts-ignore
import { sendWeeklyReminderEmail } from "../helpers/emails.js";

const prisma = new PrismaClient();

const DEFAULT_TZ = process.env.DEFAULT_TZ || "Europe/Zagreb";
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false"; // default true
const RUN_SCOPE = (process.env.RUN_SCOPE ?? "one").toLowerCase() as
  | "one"
  | "all";
const LOOP = (process.env.LOOP ?? "false").toLowerCase() === "true"; // default off
const INTERVAL_CRON = process.env.INTERVAL_CRON || "*/2 * * * *"; // every 2 minutes
const STOP_AFTER = Number(process.env.STOP_AFTER || 3); // 0 = no limit
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_ID = process.env.TEST_USER_ID;

console.log("start cron job!");

function getWeekBoundsUTC(tz: string) {
  const zoned = toZonedTime(new Date(), DEFAULT_TZ);
  const weekStartLocal = startOfWeek(zoned, { weekStartsOn: 1 }); // Monday
  const weekEndLocal = endOfWeek(zoned, { weekStartsOn: 1 }); // Sunday
  const gte = fromZonedTime(weekStartLocal, tz);
  const lte = fromZonedTime(weekEndLocal, tz);
  return { gte, lte, weekStartLocal, weekEndLocal, zoned };
}

function money(amount: number, currency?: string | null, locale = "en-GB") {
  const cur = currency ?? "EUR";
  // force 0 fraction digits
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

// Assumes Subcategory.budgetAmount is MONTHLY integer units.
// Weekly = round(monthly / 4.345) -> integer
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

async function pickTestUser(): Promise<User | null> {
  if (TEST_USER_ID)
    return prisma.user.findUnique({ where: { id: TEST_USER_ID } });
  if (TEST_USER_EMAIL)
    return prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
  // Require explicit selector for safety when scope=one
  console.warn("RUN_SCOPE=one requires TEST_USER_EMAIL or TEST_USER_ID.");
  return null;
}

async function processUser(user: User) {
  const tz = DEFAULT_TZ;
  const { gte, lte, weekStartLocal, weekEndLocal, zoned } =
    getWeekBoundsUTC(tz);

  const [spend, budget] = await Promise.all([
    weeklySpend(user.id, gte, lte),
    weeklyBudget(user.id),
  ]);

  const left = Math.max(budget - spend, 0);
  const endForLabel =
    weekEndLocal.getTime() < zoned.getTime() ? weekEndLocal : zoned;
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

  if (DRY_RUN) {
    console.log("[DRY_RUN] Would send weekly reminder to:", user.email);
    console.table(model);
  } else {
    await sendWeeklyReminderEmail(user, model);
    console.log("Sent weekly reminder to:", user.email);
  }
}

async function runOnce(scope: "one" | "all") {
  // open a connection for this tick only
  await prisma.$connect();
  try {
    if (scope === "one") {
      const user = await pickTestUser();
      if (!user?.email) {
        console.log("No test user found. Set TEST_USER_EMAIL or TEST_USER_ID.");
        return;
      }
      await processUser(user);
      return;
    }

    // scope === "all"
    const users = await prisma.user.findMany({
      where: { emailConfirmed: true, weeklyReminder: true },
      select: { id: true, email: true, currency: true },
    });

    for (const u of users) {
      try {
        await processUser(u as User);
      } catch (e) {
        console.error(`Failed for user ${u.id}`, e);
      }
    }
  } finally {
    // always release the connection(s) for this tick
    await prisma.$disconnect();
  }
}

function startDevCron(scope: "one" | "all"): ScheduledTask {
  let runs = 0;

  const task = cron.schedule(
    INTERVAL_CRON,
    async () => {
      try {
        await runOnce(scope);
      } catch (e) {
        console.error(e);
      } finally {
        if (STOP_AFTER && ++runs >= STOP_AFTER) {
          console.log(`Reached STOP_AFTER=${STOP_AFTER} runs. Stopping...`);
          task.stop();
          await prisma.$disconnect();
          process.exit(0);
        }
      }
    },
    { timezone: DEFAULT_TZ }
  );

  const shutdown = async (signal: string) => {
    console.log(
      `\n${signal} received. Stopping cron and disconnecting Prisma...`
    );
    task.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log(
    `Cron started (${INTERVAL_CRON}) in ${DEFAULT_TZ}. Press Ctrl+C to stop.`
  );
  return task;
}

// --- Entrypoint ---
if (LOOP) {
  startDevCron(RUN_SCOPE);
} else {
  runOnce(RUN_SCOPE)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

// Exported only if you want to import and start cron programmatically
export { startDevCron, runOnce };
