import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PlaceTypes = readFileSync(
  path.join(__dirname, "./typeDefs/PlaceSchema.graphql"),

  { encoding: "utf-8" },
);

const UserTypes = readFileSync(
  path.join(__dirname, "./typeDefs/UserSchema.graphql"),

  { encoding: "utf-8" },
);

export const typeDefs = `${PlaceTypes} ${UserTypes}`;

export { resolvers } from "./resolvers/resolvers.js";
