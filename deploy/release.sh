#!/usr/bin/env bash
# Server side of the deploy (.github/workflows/deploy.yml uploads this script
# and the build tarball, then runs it over SSH).
#
#   release.sh <sha> <tarball>
#
# Layout under APP_ROOT (/var/www/coffee-server):
#   releases/<sha>/   one directory per deploy: dist/, package*.json, node_modules/
#   current           symlink to releases/<sha>; PM2 runs current/dist/index.js
#                     with cwd current, so a restart picks up the new target
#   .env              the one shared env file; every release gets a .env symlink
#                     to it, so dotenv (which reads the cwd) finds it
#   incoming/         upload target for the tarball (removed once unpacked)
#
# Steps: unpack and `npm ci` in releases/<sha> (a failure here never touches the
# live release), point `current` at it, restart PM2,
# then POST `{ __typename }` to the local GraphQL endpoint until it answers. If
# it never does, `current` goes back to the previous release, PM2 restarts
# again and the script fails. On success only the newest KEEP_RELEASES
# releases stay.
#
# Overridable for a local run (tests/deployRelease.test.ts): APP_ROOT,
# HEALTH_URL, HEALTH_ATTEMPTS, HEALTH_INTERVAL; pm2, npm and curl come from PATH.
set -euo pipefail

sha=${1:-}
tarball=${2:-}

APP_ROOT=${APP_ROOT:-/var/www/coffee-server}
PM2_NAME=${PM2_NAME:-coffe-server}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3000/coffee}
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-15}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-2}
KEEP_RELEASES=5

fail() {
  echo "❌ $*" >&2
  exit 1
}

# The sha becomes a path that is later removed with rm -rf.
[[ $sha =~ ^[0-9a-f]{7,40}$ ]] || fail "usage: release.sh <sha> <tarball>; got sha '$sha'"
[[ -f $tarball ]] || fail "tarball not found: '$tarball'"
[[ -f $APP_ROOT/.env ]] || fail "shared env file missing: $APP_ROOT/.env"

releases_dir=$APP_ROOT/releases
release=$releases_dir/$sha
current_link=$APP_ROOT/current

previous=""
if [[ -L $current_link ]]; then
  previous=$(readlink "$current_link")
fi

if [[ $previous == "releases/$sha" ]]; then
  rm -f "$tarball"
  echo "✅ releases/$sha is already live; nothing to do"
  exit 0
fi

# --- Build the release next to the live one ---------------------------------
# A redeploy of an older sha (not the live one) rebuilds its directory. If
# anything below fails, the half-built release is removed; `current` and the
# running app are untouched.
mkdir -p "$releases_dir"
rm -rf "$release"
mkdir -p "$release"
trap 'rm -rf "$release"' EXIT

tar -xzf "$tarball" -C "$release"
rm -f "$tarball"
ln -s "$APP_ROOT/.env" "$release/.env"

(
  cd "$release"
  npm ci --omit=dev
  # Fetch the sharp binary for this server's platform (linux, glibc).
  npm rebuild sharp --update-binary
  node -e "console.log('sharp version:', require('sharp').version)"
)
trap - EXIT
# Pruning goes by mtime, so mark this as the newest deploy.
touch "$release"

# --- Switch and restart ------------------------------------------------------
# restart and healthy are called inside `if`, where set -e does not apply, so
# every step returns its status explicitly.
restart() {
  if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
    pm2 restart "$PM2_NAME"
  else
    # Only before the one-time migration registered the process (or if it was
    # deleted by hand): register it from current and persist the list.
    pm2 start "$current_link/dist/index.js" --name "$PM2_NAME" --cwd "$current_link" \
      --interpreter "$(command -v node)" \
      && pm2 save
  fi
}

healthy() {
  local attempt body
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
    if body=$(curl -fsS --max-time 5 -X POST \
      -H 'Content-Type: application/json' \
      --data '{"query":"{ __typename }"}' \
      "$HEALTH_URL" 2> /dev/null) && [[ $body == *'"__typename"'* ]]; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

ln -sfn "releases/$sha" "$current_link"

if ! restart || ! healthy; then
  echo "❌ releases/$sha did not come up (PM2 restart or health check at $HEALTH_URL failed)" >&2
  if [[ -z $previous || ! -d $APP_ROOT/$previous ]]; then
    fail "no previous release to roll back to; the app is down"
  fi
  ln -sfn "$previous" "$current_link"
  rm -rf "$release"
  if restart && healthy; then
    fail "rolled back to $previous"
  fi
  fail "rolled back to $previous, but it does not answer either"
fi

echo "✅ releases/$sha is live"

# --- Prune -------------------------------------------------------------------
# Newest first; release names are hex shas, so ls output is safe to split.
# shellcheck disable=SC2012
ls -1t "$releases_dir" | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  echo "Removing old release $old"
  rm -rf "${releases_dir:?}/$old"
done
