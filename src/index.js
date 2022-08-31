import { ApolloServer } from "apollo-server";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";
import { contextFactory } from "./context";

const port = process.env.PORT || 3001;

const server = new ApolloServer({
  resolvers,
  typeDefs,
  // csrfPrevention: true,
  context: ({ req }) => contextFactory(req),
});

server.listen({ port }, () =>
  console.log(`Server runs at: http://localhost:${port}`)
);
