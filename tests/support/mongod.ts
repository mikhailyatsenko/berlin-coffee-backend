/**
 * A throwaway mongod for resolver tests.
 *
 * Call setTestEnv() before importing any app module: env.ts throws on missing
 * variables and dotenv never overrides what is already set, so a real .env
 * cannot leak in. Then call useThrowawayMongod() at the top level of the test
 * file; it starts mongod before the tests and removes it afterwards.
 */
import { after, before } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import mongoose from "mongoose";

const PORT = 27000 + Math.floor(Math.random() * 1000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function setTestEnv(extra: Record<string, string> = {}) {
  Object.assign(process.env, {
    MONGO_URI: `mongodb://127.0.0.1:${PORT}/test`,
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    JWT_SECRET: "test",
    MAILERSEND_API_KEY: "test",
    NODE_ENV: "test",
    IMAGEKIT_PUBLIC_KEY: "test",
    IMAGEKIT_PRIVATE_KEY: "test",
    IMAGEKIT_URL_ENDPOINT: "https://ik.invalid/test",
    RECAPTCHA_V3_SECRET: "test",
    ...extra,
  });
}

export function useThrowawayMongod() {
  let mongod: ChildProcess;
  let dbPath: string;

  before(async () => {
    dbPath = mkdtempSync(path.join(tmpdir(), "coffemap-test-mongo-"));
    mongod = spawn(
      "mongod",
      ["--dbpath", dbPath, "--port", String(PORT), "--bind_ip", "127.0.0.1"],
      { stdio: "ignore" },
    );
    for (let attempt = 0; ; attempt++) {
      try {
        await mongoose.connect(process.env.MONGO_URI!, {
          serverSelectionTimeoutMS: 500,
        });
        break;
      } catch (error) {
        if (attempt > 40) throw error;
        await sleep(250);
      }
    }
  });

  after(async () => {
    await mongoose.disconnect();
    mongod.kill("SIGKILL");
    rmSync(dbPath, { recursive: true, force: true });
  });
}
