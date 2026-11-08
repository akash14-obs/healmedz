#!/usr/bin/env bash
# Uploads the already-built app to the server and installs it.
# Usage: deploy/deploy.sh <server-ip> <path-to-lightsail-key.pem>
# Build first: `npx ng build` in web/ and `mvn -DskipTests package` in backend/.
set -euo pipefail

IP="$1"
KEY="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new)

JAR="$ROOT/backend/target/backend-0.1.0.jar"
WEB="$ROOT/web/dist/web/browser"
[ -f "$JAR" ] && [ -f "$WEB/index.html" ] || { echo "Build the backend and web app first." >&2; exit 1; }

STAGE="$(mktemp -d "${DEPLOY_TMP:-/tmp}/healmedz.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
mkdir "$STAGE/release"
cp "$JAR" "$STAGE/release/app.jar"
cp -r "$WEB" "$STAGE/release/web"
cp "$ROOT/deploy/setup-server.sh" "$ROOT/deploy/Caddyfile" "$STAGE/release/"
(cd "$STAGE" && tar -czf release.tar.gz release)

scp "${SSH_OPTS[@]}" "$STAGE/release.tar.gz" "ubuntu@$IP:/tmp/healmedz-release.tar.gz"
ssh "${SSH_OPTS[@]}" "ubuntu@$IP" 'set -e
  rm -rf /tmp/healmedz-release
  mkdir /tmp/healmedz-release
  tar -xzf /tmp/healmedz-release.tar.gz -C /tmp/healmedz-release --strip-components=1
  sudo bash /tmp/healmedz-release/setup-server.sh
  rm -rf /tmp/healmedz-release /tmp/healmedz-release.tar.gz'
