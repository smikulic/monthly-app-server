import { ApolloServer } from "apollo-server";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";
import { contextFactory } from "./context";

const port = process.env.PORT || 3001;

var corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204,
  // credentials: true
};

const server = new ApolloServer({
  // cors: false,
  cors: corsOptions,
  resolvers,
  typeDefs,
  // csrfPrevention: true,
  context: ({ req }) => contextFactory(req),
});

server.listen({ port }, () =>
  console.log(`Server runs at: http://localhost:${port}`)
);
