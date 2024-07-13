import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const Types = readFileSync(
  path.join(__dirname, "./typeDefs/Schema.graphql"),

  { encoding: "utf-8" },
);

export const typeDefs = `${Types}`;

export { resolvers } from "./resolvers/resolvers.js";
