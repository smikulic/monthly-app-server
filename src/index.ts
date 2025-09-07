import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import cron from "node-cron";
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";
import lodash from "lodash";
const { merge } = lodash;
import { userTypeDefs } from "./schemas/userSchemas.js";
import { expenseTypeDefs } from "./schemas/expenseSchemas.js";
import { categoryTypeDefs } from "./schemas/categorySchemas.js";
import { subcategoryTypeDefs } from "./schemas/subcategorySchemas.js";
import { savingGoalTypeDefs } from "./schemas/savingGoalSchemas.js";
import { investmentTypeDefs } from "./schemas/investmentSchemas.js";
import { userResolvers } from "./resolvers/userResolvers.js";
import { expenseResolvers } from "./resolvers/expenseResolvers.js";
import { categoryResolvers } from "./resolvers/categoryResolvers.js";
import { subcategoryResolvers } from "./resolvers/subcategoryResolvers.js";
import { savingGoalResolvers } from "./resolvers/savingGoalResolvers.js";
import { investmentResolvers } from "./resolvers/investmentResolvers.js";

import { prisma } from "./context.js";
import { tryLock, unlock } from "./utils/advisoryLock.js";
import { sendAllWeeklyReminders } from "./jobs/weeklyReminder.core.js";
import { contextFactory } from "./context.js";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [new ProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: 0.5, // Capture 100% of the transactions, reduce in production!
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 0.5, // Capture 100% of the transactions, reduce in production!
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

// Apollo Server 4 with startStandaloneServer handles CORS automatically
// No explicit CORS configuration needed for basic GraphQL operations
// var corsOptions = {
//   origin: "*",
//   methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
//   preflightContinue: false,
//   optionsSuccessStatus: 204,
//   // credentials: true
// };

const Query = `
  type Query {
    _empty: String
  }
  type Mutation {
    _empty: String
  }
`;
const resolvers = {};

// The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.
const server = new ApolloServer({
  resolvers: merge(
    resolvers,
    userResolvers,
    expenseResolvers,
    categoryResolvers,
    subcategoryResolvers,
    savingGoalResolvers,
    investmentResolvers
  ),
  typeDefs: [
    Query,
    userTypeDefs,
    expenseTypeDefs,
    categoryTypeDefs,
    subcategoryTypeDefs,
    savingGoalTypeDefs,
    investmentTypeDefs,
  ],
  // Disable CSRF prevention to fix frontend refresh issues
  // Alternative security: JWT tokens + proper CORS + input validation already implemented
  csrfPrevention: false,
  // context: ({ req }) => contextFactory(req),
});

// Passing an ApolloServer instance to the `startStandaloneServer` function:
//  1. creates an Express app
//  2. installs your ApolloServer instance as middleware
//  3. prepares your app to handle incoming requests
const { url } = await startStandaloneServer(server, {
  listen: { port },
  context: async ({ req }) => {
    // Convert headers to Record<string, string | undefined>
    const normalizedHeaders: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      normalizedHeaders[key] = Array.isArray(value) ? value.join(",") : value;
    }
    return contextFactory(Object.assign(req, { headers: normalizedHeaders }));
  },
});

console.log(`🚀  Server ready at: ${url}`);

// ---- Scheduler (inside web service) ----
const DEFAULT_TZ = process.env.DEFAULT_TZ || "Europe/Zagreb";
const INTERVAL_CRON = (process.env.INTERVAL_CRON || "0 10 * * 7").trim();
const CRON_ENABLED = String(process.env.CRON_ENABLED) === "true";

let isRunning = false;

// Basic validation + boot diagnostics
if (CRON_ENABLED) {
  const ok = cron.validate(INTERVAL_CRON);
  console.log("[weekly-reminder] scheduler armed", {
    tz: DEFAULT_TZ,
    cron: INTERVAL_CRON,
    valid: ok,
    nodeTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: new Date().toString(),
  });

  cron.schedule(
    INTERVAL_CRON,
    async () => {
      // one big try/catch so early errors are logged
      try {
        if (isRunning) {
          console.log(
            "[weekly-reminder] previous tick still running — skipping."
          );
          return;
        }

        // optional: quick heartbeat at the exact minute
        console.log("[weekly-reminder] tick minute reached", {
          ts: new Date().toISOString(),
        });

        // cross-process guard
        let locked = false;
        try {
          locked = await tryLock(prisma);
        } catch (e) {
          console.error("[weekly-reminder] tryLock failed", {
            error: (e as Error)?.message ?? String(e),
          });
          return;
        }
        if (!locked) {
          console.log("[weekly-reminder] lock held — skipping tick");
          return;
        }

        isRunning = true;
        console.log("[weekly-reminder] tick start", {
          tz: DEFAULT_TZ,
          cron: INTERVAL_CRON,
          ts: new Date().toISOString(),
        });

        try {
          await sendAllWeeklyReminders(prisma);
        } finally {
          await unlock(prisma).catch(() => {});
          isRunning = false;
          console.log("[weekly-reminder] tick end", {
            ts: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error("[weekly-reminder] unhandled tick error", {
          error: (e as Error)?.message ?? String(e),
        });
      }
    },
    { timezone: DEFAULT_TZ }
  );
} else {
  console.log("[weekly-reminder] scheduler disabled (CRON_ENABLED!=true)");
}
