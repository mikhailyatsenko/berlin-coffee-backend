import "./config/env.js";
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import { typeDefs } from "./graphql/index.js";
import { resolvers } from "./graphql/index.js";
import authRouter from "./routes/authRouter.js";
import { connectDatabase } from "./config/database.js";
import cookieParser from "cookie-parser";

const app = express();

const PORT = 3000;

const bootstrapServer = async () => {
  app.use(
    cors({
      origin: "http://localhost:5173", // URL вашего фронтенда
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();

  app.use("/graphql", expressMiddleware(server));

  app.use("/auth", authRouter);

  await connectDatabase();

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Running server at ${PORT}`);
  });
};

bootstrapServer().catch((error) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
