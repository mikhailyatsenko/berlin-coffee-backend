import "./config/env.js";
import express, { Request, Response } from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import compression from "compression";
import { typeDefs } from "./graphql/index.js";
import { resolvers } from "./graphql/index.js";
import { connectDatabase } from "./config/database.js";
import cookieParser from "cookie-parser";
import User, { IUser } from "./models/User.js";
import { updateLastActive } from "./utils/updateLastActive.js";
import http from "http";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import ImageKit from "imagekit";
import {
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_URL_ENDPOINT,
} from "./config/env.js";
import {
  getUserFromAccessToken,
  refreshAccessToken,
  clearAuthCookies,
  getUserFromToken,
} from "./utils/tokenUtils.js";
import {
  GUEST_ID_HEADER,
  GUEST_SECRET_HEADER,
  GuestContext,
  guestContextFromRequest,
} from "./utils/guestAuth.js";
export interface Context {
  user?: IUser | null;
  /** Absent for signed-in users: an account always wins over guest headers. */
  guest?: GuestContext;
  req?: Request;
  res: Response;
}

const app = express();
app.set("trust proxy", 1);
const httpServer = http.createServer(app);

const PORT = 3000;

const bootstrapServer = async () => {
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

  app.use(express.urlencoded({ extended: true }));

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== "production",
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    formatError: (error) => {
      console.error("GraphQL Error:", error);
      return {
        message: error.message,
        extensions: {
          code: error.extensions?.code || "INTERNAL_SERVER_ERROR",
        },
      };
    },
  });

  await server.start();

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  app.use(cookieParser());

  app.use("/coffee", (req, res, next) => {
    res.set("Cache-Control", "public, max-age=300");
    next();
  });

  app.use(
    "/coffee",
    cors<cors.CorsRequest>({
      origin:
        process.env.NODE_ENV === "production"
          ? ["https://3welle.com", "https://dev.3welle.com"]
          : "http://localhost:5173",
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
    express.json(),
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        const accessToken = req.cookies.jwt;
        const refreshToken = req.cookies.refreshToken;

        // Try access token first
        let user = await getUserFromAccessToken(accessToken);

        // If access token failed, try refresh token
        if (!user && refreshToken) {
          const result = await refreshAccessToken(refreshToken, res);
          user = result?.user ?? null;
        }

        // Clear cookies if both tokens are invalid
        if (!user) {
          clearAuthCookies(res);
        } else {
          // Update last active only if we have a valid user
          await updateLastActive(user);
        }

        // Resolved once here rather than per resolver: a single operation can
        // touch several of them, and each would otherwise repeat the lookup.
        // Skipped entirely for signed-in users, whose account is the identity.
        const guest = user ? undefined : await guestContextFromRequest(req);

        return { user: user ?? null, guest, req, res };
      },
    }),
  );

  await connectDatabase();

  const imagekit = new ImageKit({
    publicKey: IMAGEKIT_PUBLIC_KEY!,
    privateKey: IMAGEKIT_PRIVATE_KEY!,
    urlEndpoint: IMAGEKIT_URL_ENDPOINT!,
  });

  app.get("/imagekit/auth", async (req, res) => {
    // CORS headers
    const origin = req.headers.origin;
    const allowedOrigins =
      process.env.NODE_ENV === "production"
        ? ["https://dev.3welle.com", "https://3welle.com"]
        : ["http://localhost:5173"];

    if (allowedOrigins.includes(origin || "")) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept",
    );

    const accessToken = req.cookies.jwt;
    const refreshToken = req.cookies.refreshToken;

    if (!accessToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Try access token first
      let user = await getUserFromAccessToken(accessToken);

      // If access token failed, try to refresh
      if (!user && refreshToken) {
        const result = await refreshAccessToken(refreshToken, res);
        user = result?.user ?? null;
      }

      if (!user) {
        clearAuthCookies(res);
        return res.status(401).json({ error: "User not found" });
      }

      const {
        token: imageKitToken,
        expire,
        signature,
      } = imagekit.getAuthenticationParameters();
      res.json({
        token: imageKitToken,
        expire,
        signature,
        publicKey: IMAGEKIT_PUBLIC_KEY!,
      });
    } catch (error) {
      console.error("Error verifying token for imagekit auth:", error);
      return res.status(401).json({ error: "Invalid token" });
    }
  });

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Running server at ${PORT}`);
  });
};

bootstrapServer().catch((error) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
