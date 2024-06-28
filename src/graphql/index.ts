import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const placeTypes = readFileSync(
  path.join(__dirname, "./typeDefs/place.graphql"),

  { encoding: "utf-8" },
);

export const typeDefs = `${placeTypes}`;

export { resolvers } from "./resolvers/place.resolvers.js";
