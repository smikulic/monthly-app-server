import { ApolloServer } from "apollo-server";
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";
import { merge } from "lodash";
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

const port = process.env.PORT || 3001;

var corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204,
  // credentials: true
};

const Query = `
  type Query {
    _empty: String
  }
  type Mutation {
    _empty: String
  }
`;
const resolvers = {};

const server = new ApolloServer({
  // cors: false,
  cors: corsOptions,
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
  context: ({ req }) => contextFactory(req),
});

server.listen({ port }, () =>
  console.log(`Server runs at: http://localhost:${port}`)
);
