/**
 * The server side of the deploy (deploy/release.sh): unpack into
 * releases/<sha>, install there, switch `current`, restart PM2, health-check
 * over HTTP, roll back on failure, keep the last 5 releases. Against a temp
 * app root laid out as the one-time server migration leaves it (release
 * sha(0) live), with pm2, npm and curl replaced by stubs on PATH that log
 * their calls; the curl stub answers healthy unless the live release ships a
 * `dist/unhealthy` marker.
 *
 * Run: npm test
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../deploy/release.sh",
);

const stubs = {
  pm2: `#!/bin/sh
echo "pm2 $*" >> "$STUB_LOG"
if [ "$1" = restart ] && [ -f "$STUB_STATE/pm2-restart-fails" ]; then
  rm "$STUB_STATE/pm2-restart-fails"; echo "[PM2][ERROR] stub failure" >&2; exit 1
fi
exit 0
`,
  npm: `#!/bin/sh
echo "npm $* in $PWD" >> "$STUB_LOG"
if [ "$1" = ci ]; then
  if [ -f "$STUB_STATE/npm-fails" ]; then echo "npm ERR! stub failure" >&2; exit 1; fi
  mkdir -p node_modules/sharp
  echo "module.exports = { version: 'stub' };" > node_modules/sharp/index.js
fi
exit 0
`,
  curl: `#!/bin/sh
echo "curl $*" >> "$STUB_LOG"
if [ -f "$STUB_APP_ROOT/current/dist/unhealthy" ]; then exit 22; fi
echo '{"data":{"__typename":"Query"}}'
`,
};

const sha = (n: number) => n.toString(16).padStart(40, "a");

let root: string;
let appRoot: string;
let stubBin: string;
let stubState: string;
let stubLog: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "deploy-release-")));
  appRoot = path.join(root, "app");
  stubBin = path.join(root, "bin");
  stubState = path.join(root, "state");
  stubLog = path.join(root, "calls.log");
  for (const dir of [appRoot, stubBin, stubState]) mkdirSync(dir);
  writeFileSync(path.join(appRoot, ".env"), "MONGO_URI=mongodb://prod\n");
  writeFileSync(stubLog, "");
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(path.join(stubBin, name), body);
    chmodSync(path.join(stubBin, name), 0o755);
  }
  // What the one-time migration leaves: the running code as a release, and
  // a relative `current` link to it.
  mkdirSync(path.join(appRoot, "releases", sha(0), "dist"), {
    recursive: true,
  });
  writeFileSync(path.join(appRoot, "releases", sha(0), "dist/index.js"), "");
  symlinkSync(`releases/${sha(0)}`, path.join(appRoot, "current"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** The tarball the workflow uploads: dist/, package.json, package-lock.json. */
const packTarball = (opts: { unhealthy?: boolean } = {}) => {
  const src = mkdtempSync(path.join(root, "pkg-"));
  mkdirSync(path.join(src, "dist"));
  writeFileSync(path.join(src, "dist/index.js"), "console.log('app');\n");
  if (opts.unhealthy) writeFileSync(path.join(src, "dist/unhealthy"), "");
  writeFileSync(path.join(src, "package.json"), '{"name":"app"}\n');
  writeFileSync(path.join(src, "package-lock.json"), "{}\n");
  mkdirSync(path.join(appRoot, "incoming"), { recursive: true });
  const tarball = path.join(appRoot, "incoming/deploy.tar.gz");
  const files = ["dist", "package.json", "package-lock.json"];
  const tar = spawnSync("tar", ["-czf", tarball, "-C", src, ...files]);
  assert.equal(tar.status, 0, tar.stderr.toString());
  return tarball;
};

const deploy = (
  releaseSha: string,
  opts: { unhealthy?: boolean; tarball?: string } = {},
) => {
  const tarball = opts.tarball ?? packTarball(opts);
  writeFileSync(stubLog, "");
  const run = spawnSync("bash", [script, releaseSha, tarball], {
    env: {
      PATH: `${stubBin}:${process.env.PATH}`,
      HOME: root,
      APP_ROOT: appRoot,
      HEALTH_INTERVAL: "0",
      HEALTH_ATTEMPTS: "3",
      STUB_LOG: stubLog,
      STUB_STATE: stubState,
      STUB_APP_ROOT: appRoot,
    },
    encoding: "utf8",
  });
  const calls = readFileSync(stubLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  return { status: run.status, output: run.stdout + run.stderr, calls };
};

const current = () => readlinkSync(path.join(appRoot, "current"));
const releases = () => readdirSync(path.join(appRoot, "releases")).sort();
const pm2Calls = (calls: string[]) => calls.filter((c) => c.startsWith("pm2 "));

test("a deploy installs into releases/<sha>, points current at it and restarts PM2", () => {
  const tarball = packTarball();
  const run = deploy(sha(1), { tarball });
  assert.equal(run.status, 0, run.output);

  const release = path.join(appRoot, "releases", sha(1));
  assert.equal(current(), `releases/${sha(1)}`);
  assert.ok(existsSync(path.join(release, "dist/index.js")));
  assert.equal(
    readlinkSync(path.join(release, ".env")),
    path.join(appRoot, ".env"),
  );
  assert.ok(!existsSync(tarball), "the uploaded tarball is removed");
  assert.deepEqual(releases(), [sha(0), sha(1)]);

  const inRelease = run.calls.filter((c) => c.endsWith(` in ${release}`));
  assert.deepEqual(inRelease, [
    `npm ci --omit=dev in ${release}`,
    `npm rebuild sharp --update-binary in ${release}`,
  ]);
  assert.deepEqual(pm2Calls(run.calls), ["pm2 restart coffe-server"]);
});

test("the health check is a GraphQL POST to the local endpoint", () => {
  const run = deploy(sha(1));
  assert.equal(run.status, 0, run.output);
  const health = run.calls.find((c) => c.startsWith("curl "));
  assert.ok(health, "curl was called");
  assert.match(health, /-X POST/);
  assert.match(health, /Content-Type: application\/json/);
  assert.match(health, /\{"query":"\{ __typename \}"\}/);
  assert.match(health, /http:\/\/127\.0\.0\.1:3000\/coffee/);
});

test("a failed health check points current back at the previous release, restarts PM2 and fails", () => {
  assert.equal(deploy(sha(1)).status, 0);
  const run = deploy(sha(2), { unhealthy: true });
  assert.notEqual(run.status, 0);
  assert.equal(current(), `releases/${sha(1)}`);
  assert.deepEqual(pm2Calls(run.calls), [
    "pm2 restart coffe-server",
    "pm2 restart coffe-server",
  ]);
  const healthChecks = run.calls.filter((c) => c.startsWith("curl "));
  assert.equal(healthChecks.length, 3 + 1, "3 attempts, one after rollback");
  assert.deepEqual(releases(), [sha(0), sha(1)], "the failed one is removed");
  assert.match(run.output, /rolled back to .*releases\/a+1/i);
});

test("rollback works when the migration left an absolute current link", () => {
  rmSync(path.join(appRoot, "current"));
  const live = path.join(appRoot, "releases", sha(0));
  symlinkSync(live, path.join(appRoot, "current"));
  const run = deploy(sha(1), { unhealthy: true });
  assert.notEqual(run.status, 0);
  assert.equal(realpathSync(path.join(appRoot, "current")), live);
  assert.deepEqual(releases(), [sha(0)]);
  assert.match(run.output, /rolled back/i);
});

test("a failed PM2 restart after the switch rolls back like a failed health check", () => {
  assert.equal(deploy(sha(1)).status, 0);
  writeFileSync(path.join(stubState, "pm2-restart-fails"), "");
  const run = deploy(sha(2));
  assert.notEqual(run.status, 0);
  assert.equal(current(), `releases/${sha(1)}`);
  assert.deepEqual(pm2Calls(run.calls), [
    "pm2 restart coffe-server",
    "pm2 restart coffe-server",
  ]);
  assert.deepEqual(releases(), [sha(0), sha(1)]);
  assert.match(run.output, /rolled back to .*releases\/a+1/i);
});

test("a server without the current link (not migrated) is rejected before anything happens", () => {
  rmSync(path.join(appRoot, "current"));
  const run = deploy(sha(1));
  assert.notEqual(run.status, 0);
  assert.match(run.output, /not migrated/i);
  assert.deepEqual(run.calls, []);
  assert.deepEqual(releases(), [sha(0)]);
});

test("a failed npm ci never touches the live release", () => {
  assert.equal(deploy(sha(1)).status, 0);
  writeFileSync(path.join(stubState, "npm-fails"), "");
  const run = deploy(sha(2));
  assert.notEqual(run.status, 0);
  assert.equal(current(), `releases/${sha(1)}`);
  assert.deepEqual(pm2Calls(run.calls), []);
  assert.deepEqual(releases(), [sha(0), sha(1)], "no partial release is left");
});

test("only the last 5 releases are kept", () => {
  for (let n = 1; n <= 7; n++) assert.equal(deploy(sha(n)).status, 0);
  assert.equal(current(), `releases/${sha(7)}`);
  assert.deepEqual(releases(), [3, 4, 5, 6, 7].map(sha));
});

test("pruning goes by deploy order, so a redeployed older sha counts as new", () => {
  for (let n = 1; n <= 5; n++) assert.equal(deploy(sha(n)).status, 0);
  // Deploying an old commit again (a re-run of an old workflow run).
  assert.equal(deploy(sha(1)).status, 0);
  assert.equal(deploy(sha(6)).status, 0);
  assert.equal(current(), `releases/${sha(6)}`);
  assert.deepEqual(releases(), [1, 3, 4, 5, 6].map(sha));
});

test("deploying the sha that is already live changes nothing", () => {
  assert.equal(deploy(sha(1)).status, 0);
  const run = deploy(sha(1));
  assert.equal(run.status, 0, run.output);
  assert.equal(current(), `releases/${sha(1)}`);
  assert.deepEqual(run.calls, []);
  assert.match(run.output, /already live/i);
});

test("a malformed sha is rejected before anything happens", () => {
  const run = deploy("../../etc");
  assert.notEqual(run.status, 0);
  assert.deepEqual(run.calls, []);
  assert.deepEqual(releases(), [sha(0)]);
});

test("a missing shared .env is rejected before anything happens", () => {
  rmSync(path.join(appRoot, ".env"));
  const run = deploy(sha(1));
  assert.notEqual(run.status, 0);
  assert.match(run.output, /\.env/);
  assert.deepEqual(run.calls, []);
});
