import "dotenv/config";
import { prisma } from "../context.js";
import { tryLock, unlock } from "../utils/advisoryLock.js";
import { sendAllWeeklyReminders } from "../jobs/weeklyReminder.core.js";

(async () => {
  if (!(await tryLock(prisma))) {
    console.log("[weekly-reminder] lock held — skipping manual run");
    process.exit(0);
  }
  try {
    console.log("[weekly-reminder] manual run start", {
      ts: new Date().toISOString(),
    });
    await sendAllWeeklyReminders(prisma);
    console.log("[weekly-reminder] manual run end", {
      ts: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[weekly-reminder] manual run error", {
      error: (e as Error)?.message ?? String(e),
    });
    process.exitCode = 1;
  } finally {
    await unlock(prisma).catch(() => {});
  }
})();
