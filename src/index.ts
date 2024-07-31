import "./config/env.js";
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import { typeDefs } from "./graphql/index.js";
import { resolvers } from "./graphql/index.js";
import { connectDatabase } from "./config/database.js";
import cookieParser from "cookie-parser";
import User, { IUser } from "./models/User.js";
import http from "http";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import jwt from "jsonwebtoken";

interface Context {
  user?: IUser;
}

const app = express();
app.set("trust proxy", 1);
const httpServer = http.createServer(app);

const PORT = 3000;

const bootstrapServer = async () => {
  app.use(express.urlencoded({ extended: true }));

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== "production",
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await server.start();

  app.use(cookieParser());

  app.use(
    "/coffee",
    cors<cors.CorsRequest>({
      origin:
        process.env.NODE_ENV === "production"
          ? "https://3welle.com"
          : "http://localhost:5173",
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        const token = req.cookies.jwt;

        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
              id: string;
            };
            const user = await User.findById(decoded.id);
            return { user, res };
          } catch (e) {
            console.error("Error verifying token:", e);
            res.clearCookie("jwt");
          }
        }
        return { res };
      },
    }),
  );

  await connectDatabase();

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Running server at ${PORT}`);
  });
};

bootstrapServer().catch((error) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
