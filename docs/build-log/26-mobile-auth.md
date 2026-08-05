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

## `0dec381` — docs: define optional mobile authentication

D25 records the trust and ownership boundary before client code exists. It
keeps SQLite usable without an account, keeps domain traffic behind Express,
limits Expo configuration to public connection coordinates, and requires
`/v1/me` to agree with the Supabase session before one durable SQLite binding.

## `3f3b470` — feat: persist optional account sessions

The Expo app now has one nullable Supabase client configured with persisted
sessions, automatic refresh, `processLock`, and no browser URL-session parsing.
The provider is absent when all public values are absent and rejects partial,
credential-bearing, path-bearing, or non-HTTPS production origins. A provider
construction failure leaves the SQLite-only app available.

Native sessions use Expo SecureStore through a bounded UTF-8 chunk adapter.
Two alternating slots let it write every new chunk before replacing a small
manifest; a partial write is cleaned up and the old readable session remains.
Web uses local storage. Direct tests cover config, Unicode round trips, removal,
overwrite cleanup, write failure cleanup, and the total-size ceiling. The hook
now runs every auth test, and `.env.example` contains only the three D25 public
values while real environment files remain ignored.

## `4ccdd62` — feat: verify and bind cloud accounts

The client calls only `GET /v1/me` with a Bearer token. Requests time out after
a bounded interval, accept a bounded strict account response, treat deletion
explicitly, and perform exactly one session refresh and retry after a 401. The
backend id must equal the session user id. Provider, response, password, and
token details are never copied into public errors or logs.

SQLite inspection counts jobs, shifts, and withholding settings alongside the
durable account id. Empty unbound data binds inside one exclusive transaction.
Populated unbound data returns a consent state without mutation. Same-account
data continues, while a different account throws without changing the binding,
cursor, metadata, outbox, or domain rows. Confirmation verifies `/v1/me` again
immediately before binding. Focused tests cover the HTTP header, timeout,
refresh limit, deleted/malformed/mismatched responses, consent, empty binding,
and mismatch preservation.

## `3d72bce` — feat: add optional account controls

One root provider owns Supabase auth events and native foreground refresh. Its
auth callback only mirrors session state; backend and SQLite work runs later so
an awaited auth call cannot deadlock the client. Manage data now shows distinct
configuration-unavailable, signed-out, verification-pending, connecting,
consent, connected, retry, deleted, and mismatch states. Sign-out explicitly
says it removes only the saved login; local records, account binding, and
pending changes stay. Trends and Log do not depend on account configuration.

The final local gates were:

- full repository hook: docs, 74 schema checks, migration/backup checks, 11
  server tests, 11 local sync tests, 9 auth tests, and all pure-library tests;
- `npx tsc --noEmit` and `npx expo install --check`;
- Expo Doctor: 20 of 20 checks;
- Fallow changed-file audit: no dead-code or complexity gate findings; two
  intentional same-boundary auth-flow duplication warnings remain documented
  inline rather than abstracted into harder-to-review state machinery;
- `npx expo export --platform all`: web, iOS, and Android bundled successfully.

These are compile and synthetic-contract results. They do not prove a real
Supabase project, SMTP delivery, deployed Express API, native SecureStore
restoration, token refresh on hardware, or provider-backed identity flow.

Playwright could not reach Manage data because an existing web SQLite startup
failure happens first: `src/data/db.ts` constructs an Expo File for bundled SQL,
but `expo-file-system` is unsupported on web and throws `File.validatePath`.
That blocker predates this account UI and is not expanded into this auth unit.
The successful web export therefore remains bundle evidence only.

## Next lifecycle units

First create and configure the external staging resources, apply server
migrations, and complete D25's iOS/Android provider acceptance matrix. Then add
mobile push/pull transport and retry scheduling against the already-tested D24
API. Password recovery deep links, destructive account deletion, and conflict
resolution stay separate so each can carry its own security and native proof.
