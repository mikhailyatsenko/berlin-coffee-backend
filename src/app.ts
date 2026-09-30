import { config } from "./config/config.js";
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import compression from "compression";
import { typeDefs } from "./graphql/index.js";
import { resolvers } from "./graphql/index.js";
import cookieParser from "cookie-parser";
import http from "http";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { GUEST_ID_HEADER, GUEST_SECRET_HEADER } from "./utils/guestAuth.js";
import type { Context } from "./graphql/context.js";
import { buildContext } from "./graphql/buildContext.js";
import { formatError } from "./graphql/formatError.js";

// The largest real request is an avatar: the client sends the picked file as
// is, up to 5 MB, base64-encoded (~6.7 MB), plus the GraphQL envelope.
// A larger body gets 413 from the parser.
const JSON_BODY_LIMIT = "7mb";

/**
 * Builds the Express app with GraphQL mounted on `/coffee` and starts Apollo.
 * Returns the HTTP server Apollo drains on shutdown; connecting the database and
 * listening on it are left to the caller, so tests can use a random port.
 */
export const createApp = async () => {
  const app = express();
  app.set("trust proxy", 1);
  const httpServer = http.createServer(app);

  app.use(
    compression({
      threshold: 1024,
      level: 2,
      filter: (req: express.Request, res: express.Response) => {
        if (req.headers["x-no-compression"]) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    introspection: !config.isProduction,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    formatError,
  });

  await server.start();

  app.use(cookieParser());

  app.use(
    "/coffee",
    cors<cors.CorsRequest>({
      origin: config.frontendUrl,
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Content-Length",
        GUEST_ID_HEADER,
        GUEST_SECRET_HEADER,
      ],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
    express.json({ limit: JSON_BODY_LIMIT }),
    expressMiddleware(server, { context: buildContext }),
  );

  return { httpServer };
};
