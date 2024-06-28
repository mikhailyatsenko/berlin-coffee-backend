import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";

import { typeDefs } from "./graphql/index.js";
import { resolvers } from "./graphql/index.js";

const app = express();

const PORT = process.env.PORT || 4001;

const bootstrapServer = async () => {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/graphql", expressMiddleware(server));

  app.listen(PORT, () => {
    console.log(
      `Running a GraphQL API server at http://localhost:${PORT}/graphql`,
    );
  });
};

bootstrapServer();
