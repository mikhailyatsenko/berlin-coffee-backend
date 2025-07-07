import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaFiles = [
  "./typeDefs/types/user.graphql",
  "./typeDefs/types/place.graphql",
  "./typeDefs/types/review.graphql",
  "./typeDefs/types/characteristic.graphql",
  "./typeDefs/types/common.graphql",
  "./typeDefs/root.graphql",
];

const typeDefs = schemaFiles
  .map((file) => readFileSync(path.join(__dirname, file), "utf-8"))
  .join("\n");

export { typeDefs };
export { resolvers } from "./resolvers/resolvers.js";
