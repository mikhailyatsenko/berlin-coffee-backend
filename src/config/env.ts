import dotenv from "dotenv";

dotenv.config();

export const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  JWT_SECRET,
  MONGO_URI,
  PORT,
  NODE_ENV,
} = process.env;

console.log(NODE_ENV);

const requiredEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JWT_SECRET",
  "MONGO_URI",
  "NODE_ENV",
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
