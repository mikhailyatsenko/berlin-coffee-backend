import "./config/env.js";
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import compression from "compression";
import { typeDefs } from "./graphql/index.js";
import { resolvers } from "./graphql/index.js";
import { connectDatabase } from "./config/database.js";
import cookieParser from "cookie-parser";
import User, { IUser } from "./models/User.js";
import http from "http";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import jwt from "jsonwebtoken";
import ImageKit from 'imagekit';
import { IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT } from "./config/env.js";
export interface Context {
  user?: IUser;
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

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
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
      allowedHeaders: ["Content-Type", "Authorization", "Content-Length"],
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

  const imagekit = new ImageKit({
    publicKey: IMAGEKIT_PUBLIC_KEY!,
    privateKey: IMAGEKIT_PRIVATE_KEY!,
    urlEndpoint: IMAGEKIT_URL_ENDPOINT!,
  });

  app.get('/imagekit/auth', async (req, res) => {
    // if (req.cookies.jwt) {
    //   const decoded = jwt.verify(req.cookies.jwt, process.env.JWT_SECRET!) as {
    //     id: string;
    //   };
    //   const user = await User.findById(decoded.id);
    //   if (user) {
    const { token, expire, signature } = imagekit.getAuthenticationParameters();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept");
    res.json({
      token,
      expire,
      signature,
      publicKey: IMAGEKIT_PUBLIC_KEY!
    });
    // }
    // }

  });

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Running server at ${PORT}`);
  });
};

bootstrapServer().catch((error) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
