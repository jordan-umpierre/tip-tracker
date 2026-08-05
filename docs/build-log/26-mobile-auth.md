# Mobile authentication

## D25 — optional local-first accounts (2026-08-05)

D25 fixes the mobile boundary before implementation. Supabase owns email and
password identity; the Expo app persists the provider session securely and
sends its access token only to Express. Express remains the sole domain-data
API. SQLite remains fully usable signed out.

The first verified mobile unit is intentionally smaller than account and sync
lifecycle as a whole: signup, verification-pending feedback, sign-in, session
restore/refresh, `/v1/me` verification, deliberate SQLite account binding, and
local sign-out. Recovery, deletion, sync traffic, retry scheduling, conflict
resolution, provider creation, SMTP, and deployment remain separate units.

The decision follows the official [Supabase React Native auth guide](https://supabase.com/docs/guides/auth/quickstarts/react-native),
[Supabase session documentation](https://supabase.com/docs/guides/auth/sessions),
and [Expo SDK 57 SecureStore documentation](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/).
