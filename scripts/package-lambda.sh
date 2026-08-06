#!/usr/bin/env bash
#
# Builds the deployment zip for the Lambda that runs the API.
#
# Run from anywhere:  ./scripts/package-lambda.sh
# Produces:           dist/lambda.zip
#
# The zip has to mirror the repo layout rather than just holding server/'s
# contents, because server/src/syncContract.ts imports ../../contracts. Laid
# out flat, that path would climb out of /var/task and fail on the first sync
# request -- a runtime error in production for a mistake made at package time.
set -euo pipefail

# Run relative to the repo root no matter where this was invoked from.
cd "$(dirname "$0")/.."

STAGE=dist/lambda
rm -rf "$STAGE" dist/lambda.zip
mkdir -p "$STAGE/server"

# The three things the server actually needs at runtime. src/ is shipped as
# TypeScript on purpose: Node 24 strips the types itself, which is why this
# project has no build step to run here.
cp -R contracts "$STAGE/contracts"
cp -R server/src "$STAGE/server/src"
cp server/package.json "$STAGE/server/package.json"

# migrations/ is needed at runtime, not just for `npm run migrate`. Startup
# calls assertSchemaCurrent, which reads these files and compares them against
# what the database reports as applied, so a server whose code is ahead of its
# database refuses to serve instead of failing one query at a time. Leaving
# them out crashes the process on boot with ENOENT.
cp -R server/migrations "$STAGE/server/migrations"

# Lambda's handler entry, at the zip root where the Handler setting expects it.
# The execute bit has to survive into the zip or the adapter cannot launch it.
cp server/run.sh "$STAGE/run.sh"
chmod +x "$STAGE/run.sh"

# Production dependencies only -- the dev tree carries TypeScript itself, which
# is a few hundred files Lambda would unpack on every cold start for nothing.
# --omit=dev with a clean install keeps the zip to just express, jose, and pg.
cp server/package-lock.json "$STAGE/server/package-lock.json"
npm --prefix "$STAGE/server" ci --omit=dev --silent
rm "$STAGE/server/package-lock.json"

# contracts/syncFormat.ts sits outside server/, so Node looks for the nearest
# package.json above it and finds none. Without this it reparses the file as an
# ES module and says so in the logs, and that reparse cost lands on every cold
# start. Declaring the type once here removes both.
echo '{"type":"module"}' > "$STAGE/package.json"

# -r recurses, -q keeps the output quiet. Zipping from inside the staging
# directory is what puts run.sh at the archive root instead of under dist/.
(cd "$STAGE" && zip -rq ../lambda.zip .)

echo "built dist/lambda.zip ($(du -h dist/lambda.zip | cut -f1))"
