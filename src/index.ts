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
import { avatarUpload } from "./utils/avatarUpload.js";
import path from "path";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  app.post(
    "/upload-avatar",
    cors({
      origin:
        process.env.NODE_ENV === "production"
          ? "https://3welle.com"
          : "http://localhost:5173",
      credentials: true,
    }),
    (req, res, next) => {
      const token = req.cookies.jwt;

      if (!token) {
        return res.status(401).json({ error: "User not authenticated." });
      }

      next();
    },

    (req, res, next) => {
      avatarUpload.single("avatar")(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }
        next();
      });
    },

    (req, res) => {
      if (!req.file) {
        return res.status(400).send("No file uploaded.");
      }

      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/user-${req.body.userId}/avatar/${req.file.filename}`;

      res.json({ fileUrl });
    },
  );

  // Static folder for uploaded images
  app.use("/uploads", express.static(path.join(__dirname, "./uploads")));

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Running server at ${PORT}`);
  });
};

bootstrapServer().catch((error) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
