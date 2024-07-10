import dotenv from "dotenv";

dotenv.config();

export const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  JWT_SECRET,
  MONGO_URI,
  PORT,
  NODE_ENV,
  CLIENT_URL,
} = process.env;

const requiredEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JWT_SECRET",
  "MONGO_URI",
  "NODE_ENV",
  "CLIENT_URL",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
