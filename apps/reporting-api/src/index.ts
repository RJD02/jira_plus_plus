import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { typeDefs } from "./graphql/typeDefs.js";
import { resolvers } from "./graphql/resolvers.js";
import { createContext } from "./context.js";
import type { Context } from "./types.js";

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

const port = Number(process.env.PORT ?? 4002);

async function main() {
  const { url } = await startStandaloneServer(server, {
    listen: { port },
    context: async ({ req }) => createContext({ req }),
  });
  // eslint-disable-next-line no-console
  console.log(`Reporting GraphQL API ready at ${url}`);
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start Reporting API", error);
  process.exit(1);
});
