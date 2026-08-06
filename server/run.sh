#!/bin/bash
#
# What Lambda runs to start this server.
#
# Lambda normally wants a JavaScript function to call. This app is a plain
# Express server instead, so it uses the AWS Lambda Web Adapter layer: the
# layer starts us, waits for the port to answer, and then translates each
# Lambda invoke into a real HTTP request against it. Nothing in src/ changes.
#
# The adapter is wired up by two settings on the function itself, not here:
#   Handler                 = run.sh          (this file)
#   AWS_LAMBDA_EXEC_WRAPPER = /opt/bootstrap  (the layer's launcher)
#
# The working directory is /var/task, which is the root of the deployment zip,
# so server/ and contracts/ both sit alongside each other exactly as they do in
# the repo. That matters -- src/syncContract.ts imports ../../contracts, and
# flattening the zip would break that import at runtime rather than at build.
#
# exec replaces this shell with node instead of leaving it as a parent process.
# Without it the shell keeps running and swallows the SIGTERM Lambda sends at
# shutdown, so index.ts never gets to close the database pool cleanly.
exec node server/src/index.ts
