#!/usr/bin/env bash
#
# Deploys the API to AWS Lambda and prints its public URL.
#
# Run from anywhere:  ./scripts/deploy-lambda.sh
#
# Safe to run repeatedly. The first run creates the function and its URL; every
# run after that updates the code and configuration in place.
#
# Prerequisites, none of which this script creates for you:
#   - the AWS CLI configured for us-west-2 (aws configure)
#   - the execution role tip-tracker-api-lambda
#   - server/.env holding the six provider values, already verified with
#     `npm --prefix server run check-provider`
set -euo pipefail

cd "$(dirname "$0")/.."

FUNCTION=tip-tracker-api
REGION=us-west-2
ROLE_NAME=tip-tracker-api-lambda

# The AWS Lambda Web Adapter. This is the piece that lets a plain Express
# server run on Lambda unchanged: it boots run.sh, waits for the port to
# answer, then turns each invoke into an HTTP request. Published by AWS under
# account 753240598075. Arm64 here has to match --architectures below.
LAYER="arn:aws:lambda:${REGION}:753240598075:layer:LambdaAdapterLayerArm64:28"

# Look the role up by name rather than pasting an ARN, so this file carries no
# account number and stays safe to commit.
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"

./scripts/package-lambda.sh

# Build the environment Lambda will run with.
#
# The six provider values are secrets, so they are never passed as command
# arguments -- anything on a command line is visible to other processes via ps.
# They go into a private temp file instead, which is deleted on the way out.
#
# node --env-file reads server/.env the same way the local server does, so
# there is one parser for both and no chance of them disagreeing about quoting.
ENV_JSON="$(mktemp)"
chmod 600 "$ENV_JSON"
trap 'rm -f "$ENV_JSON"' EXIT

node --env-file=server/.env -e '
  const required = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ISSUER",
                    "SUPABASE_AUDIENCE", "SUPABASE_JWKS_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const vars = {};
  for (const key of required) {
    if (!process.env[key]) { console.error(`server/.env is missing ${key}`); process.exit(1); }
    vars[key] = process.env[key];
  }

  Object.assign(vars, {
    // Tells Lambda to start through the adapter layer instead of looking for a
    // JavaScript handler function. Without this the function fails on the first
    // invoke with a handler resolution error.
    AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",

    // The adapter listens for the app on 8080 by default. config.ts reads PORT,
    // so this is what makes the two agree on a port.
    PORT: "8080",

    // The adapter probes this path until it answers before sending the first
    // real request. Left at its default it probes "/", which this app does not
    // serve.
    AWS_LWA_READINESS_CHECK_PATH: "/health",

    // One proxy sits in front of the app: the API Gateway HTTP API created
    // below, which puts the caller address in X-Forwarded-For. (This used to
    // say "the Function URL", which the bottom of this script now deletes.)
    // Express needs the exact count or the rate limiter buckets every caller
    // together. Raising this above the real number would instead let a caller
    // forge the header and pick its own bucket.
    //
    // Still a reading of how the adapter forwards the address, not a measured
    // fact: the request log records no client address to check it against.
    TRUST_PROXY_HOPS: "1",
  });

  process.stdout.write(JSON.stringify({ Variables: vars }));
' > "$ENV_JSON"

# Create on the first run, update on every one after. Asking for the function
# is how we tell which case we are in -- there is no create-or-update call.
if aws lambda get-function --function-name "$FUNCTION" --region "$REGION" >/dev/null 2>&1; then
  echo "updating $FUNCTION"

  aws lambda update-function-code \
    --function-name "$FUNCTION" --region "$REGION" \
    --zip-file fileb://dist/lambda.zip >/dev/null

  # Code and configuration are two separate updates, and the second is rejected
  # while the first is still settling. Waiting is not optional here.
  aws lambda wait function-updated --function-name "$FUNCTION" --region "$REGION"

  aws lambda update-function-configuration \
    --function-name "$FUNCTION" --region "$REGION" \
    --environment "file://$ENV_JSON" \
    --layers "$LAYER" >/dev/null
else
  echo "creating $FUNCTION"

  # 512 MB is a starting point, not a measurement. Lambda scales CPU with
  # memory, so if cold starts are slow this is the first dial to turn.
  # 30s timeout is generous for this app; it exists to bound a hung database
  # call rather than to allow slow ones.
  aws lambda create-function \
    --function-name "$FUNCTION" --region "$REGION" \
    --runtime nodejs24.x \
    --architectures arm64 \
    --role "$ROLE_ARN" \
    --handler run.sh \
    --zip-file fileb://dist/lambda.zip \
    --timeout 30 \
    --memory-size 512 \
    --layers "$LAYER" \
    --environment "file://$ENV_JSON" >/dev/null

  # A brand new function is still being provisioned when create returns, and
  # the waiter for that is not the same one an update uses -- this waits for
  # State to reach Active, not for a pending update to settle.
  aws lambda wait function-active-v2 --function-name "$FUNCTION" --region "$REGION"
fi

aws lambda wait function-updated --function-name "$FUNCTION" --region "$REGION"

# The public entry point is an API Gateway HTTP API, not a Lambda Function URL.
#
# A Function URL was the first attempt and it answered 403 on every request.
# The cause is an account-level Lambda setting that blocks public access, on by
# default for accounts created recently: it overrides the function's own
# resource policy, so a policy that reads as correct still grants nothing. The
# function was never even invoked -- no log group was ever created.
#
# API Gateway sidesteps that rather than fighting it. It calls the function as
# the API Gateway service principal, so no public resource policy exists to be
# blocked, and the invoke grant below names one specific API instead of "*".
# It is also the shape this needs eventually anyway: a Function URL has no
# custom domain, no throttling, and no staged deploys.
API_NAME="$FUNCTION"
FUNCTION_ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" --query 'Configuration.FunctionArn' --output text)"

# Pull the account id off the role ARN so this file still carries no account
# number of its own. Strip the fixed prefix, then everything from the next
# colon on, leaving the digits in the middle.
ACCOUNT_ID="${ROLE_ARN#arn:aws:iam::}"
ACCOUNT_ID="${ACCOUNT_ID%%:*}"

# APIs are found by name because the id is generated at creation time and this
# script has nowhere to remember it between runs.
API_ID="$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)"

if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
  echo "creating HTTP API"

  # --target is API Gateway's quick create: it builds the Lambda proxy
  # integration, a $default route catching every path and method, and a
  # $default stage that auto-deploys. That is exactly what an app doing its own
  # routing in Express wants -- one catch-all, no per-route config to keep in
  # sync with the code.
  API_ID="$(aws apigatewayv2 create-api \
    --region "$REGION" \
    --name "$API_NAME" \
    --protocol-type HTTP \
    --target "$FUNCTION_ARN" \
    --query 'ApiId' --output text)"
fi

# Let this one API invoke the function. Scoped by source ARN, so a different
# API in the same account cannot call it. Quick create does not add this when
# driven from the CLI, and without it every request comes back 500.
#
# add-permission fails if the statement id already exists, which is the normal
# case on a redeploy, so a repeat is not an error worth stopping for.
aws lambda add-permission \
  --function-name "$FUNCTION" --region "$REGION" \
  --statement-id AllowInvokeFromHttpApi \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" >/dev/null 2>&1 || true

# Clear out the failed Function URL attempt so there is no second, permanently
# broken entry point left pointing at this function.
if aws lambda get-function-url-config --function-name "$FUNCTION" --region "$REGION" >/dev/null 2>&1; then
  echo "removing the unused function URL"
  aws lambda delete-function-url-config --function-name "$FUNCTION" --region "$REGION" >/dev/null
  aws lambda remove-permission --function-name "$FUNCTION" --region "$REGION" \
    --statement-id FunctionURLAllowPublicAccess >/dev/null 2>&1 || true
fi

ENDPOINT="$(aws apigatewayv2 get-api --region "$REGION" --api-id "$API_ID" --query 'ApiEndpoint' --output text)"
echo
echo "deployed: $ENDPOINT"
echo "health:   ${ENDPOINT}/health"
