import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";
import lodash from "lodash";
const { merge } = lodash;
import { userTypeDefs } from "./schemas/userSchemas";
import { expenseTypeDefs } from "./schemas/expenseSchemas";
import { categoryTypeDefs } from "./schemas/categorySchemas";
import { subcategoryTypeDefs } from "./schemas/subcategorySchemas";
import { savingGoalTypeDefs } from "./schemas/savingGoalSchemas";
import { userResolvers } from "./resolvers/userResolvers";
import { expenseResolvers } from "./resolvers/expenseResolvers";
import { categoryResolvers } from "./resolvers/categoryResolvers";
import { subcategoryResolvers } from "./resolvers/subcategoryResolvers";
import { savingGoalResolvers } from "./resolvers/savingGoalResolvers";
import { contextFactory } from "./context";

Sentry.init({
  dsn: "https://5afc1975164a2c5f1f04878cf842a565@o4506037007810560.ingest.sentry.io/4506039360815104",
  integrations: [new ProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: 0.5, // Capture 100% of the transactions, reduce in production!
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 0.5, // Capture 100% of the transactions, reduce in production!
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

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
  // cors: false,
  // cors: corsOptions,
  resolvers: merge(
    resolvers,
    userResolvers,
    expenseResolvers,
    categoryResolvers,
    subcategoryResolvers,
    savingGoalResolvers
  ),
  typeDefs: [
    Query,
    userTypeDefs,
    expenseTypeDefs,
    categoryTypeDefs,
    subcategoryTypeDefs,
    savingGoalTypeDefs,
  ],
  // csrfPrevention: true,
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
