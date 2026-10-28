# 0021: Better Auth with sessions in DB_Auth

## Status

Accepted. Supersedes [0006](./0006-e2e-auth-bypass-via-signed-session-cookie.md), and replaces the Auth.js redirect proxy described in [0020](./0020-per-pr-worker-previews.md). Auth is no longer the only long-lived D1: since [0025](./0025-ontology-d1-single-source-of-truth.md), `DB_Ontology` is never replaced either, and its schema is owned by D1 migrations the same way.

## Context

`apps/ontology` signed users in with Auth.js (`@auth/sveltekit`), Google as the only provider, and stateless JWT sessions. Two things changed:

- Auth.js went into maintenance mode on 2025-09-22, when the Better Auth team took it over: security patches and urgent fixes only, and new projects are pointed to Better Auth ([announcement](https://www.better-auth.com/blog/authjs-joins-better-auth)).
- `@auth/sveltekit` 1.11.3 breaks on SvelteKit 3 ([nextauthjs/next-auth#13502](https://github.com/nextauthjs/next-auth/issues/13502), closed without a fix). It was one of the two blockers on the SvelteKit 3 upgrade.

Better Auth's SvelteKit integration (`better-auth/svelte-kit`) imports nothing from `@sveltejs/kit`, so it runs on SvelteKit 2 and 3.

## Decision

**Ontology signs in with Better Auth, following its conventions, with sessions stored in the `DB_Auth` D1 database.**

- `src/lib/server/better_auth.ts` builds the configuration: Google as the only social provider, `basePath: '/auth'` (so Google's registered callback, `/auth/callback/google`, is unchanged), and `DB_Auth` as the database, which Better Auth's kysely adapter accepts as a D1 binding. `hooks.server.ts` builds the instance on an isolate's first request and reads the session into `locals.user`. Permissions are unchanged: `is_authorized()` still checks `User_Permissions` by email.
- **Sessions are stateful.** Better Auth's `user`, `session`, `account` and `verification` tables live in `DB_Auth`. A session can be revoked by deleting its row, which stateless JWTs couldn't offer. Google's OAuth tokens in `account` are encrypted with the app's secret (`account.encryptOAuthTokens`).
- **D1's own migrations own that schema** (`migrations_dir: "migrations/auth"` on `DB_Auth` in `wrangler.jsonc`). Auth is the only long-lived, undated D1: the others are dated snapshots that `tools/databases` replaces whole. They own all of it: `0001` creates Better Auth's tables, and `0002` the permission tables (`Users`, `Permissions`, `User_Permissions`), which production already had, so it's written to change nothing there. `db:load` builds the local `DB_Auth` from an empty database with `wrangler d1 migrations apply DB_Auth --local`; there's no Auth snapshot, and `tools/databases`' `migrate:auth` is gone. Production gets `--remote` once per new migration, before the code that needs it merges.
- **The secret is `BETTER_AUTH_SECRET`**, Better Auth's own name. `setup:env` generates a local one.
- **Previews sign in through Better Auth's OAuth proxy** (`oAuthProxy`), which replaces Auth.js's `redirectProxyUrl`. A Preview sends production's callback URL to Google; production exchanges the code and redirects back with the profile encrypted under the shared secret; the Preview creates the session. `OAUTH_REDIRECT_PROXY_URL` now holds production's origin. Previews share production's `DB_Auth`, so a Preview sign-in writes its user and session rows to production's database.
- **e2e tests sign in with Better Auth's `testUtils` plugin**, its documented technique for Playwright. `e2e/support/sign_in.ts` builds a test-only instance from the same configuration, opens the local `DB_Auth` through `getPlatformProxy()`, saves the user and creates a session with `ctx.test`, and adds the session cookie to the browser context. The plugin is never part of the app's own configuration.

## Alternatives considered

- **Stay on Auth.js.** Rejected: maintenance mode, and it blocks SvelteKit 3.
- **Better Auth without a database (stateless, cookie-cached sessions).** Closest to the old setup, but Better Auth prescribes no way to test it: `testUtils` creates sessions through the database adapter, and without one Better Auth falls back to an in-memory store the dev server can't see. e2e would have had to mint Better Auth's encrypted session cookies by hand, as ADR 0006 did for Auth.js.
- **Add Better Auth's tables to `tools/databases/migrations/auth`.** Rejected: that script dropped and recreated tables to build a fresh snapshot, so production would need each schema change applied by hand, with nothing recording what had been applied. The permission tables it created moved into `0002` for the same reason.

## Consequences

- Every user signs in once more at the cutover: the cookie names change, and old Auth.js sessions aren't read.
- Each signed-in request reads its session from D1. Better Auth's cookie cache could cut that, at the cost of revocation taking effect only when the cache expires; it's off until load says otherwise.
- A Better Auth upgrade or plugin that changes the schema needs a new migration in `apps/ontology/migrations/auth/`, applied to production before merge. `getMigrations` from `better-auth/db` emits the SQL for a given configuration; `0001_better_auth.sql` came from it.
- Previews write user and session rows to production's `DB_Auth`. ADR 0020 already accepts that Preview code holds production's secret and can sign sessions production trusts, so this adds little new risk.
- Better Auth stores more than Auth.js did: a session row (with the browser's user agent) and an `account` row with Google's encrypted tokens, alongside name and email. `apps/www`'s privacy policy says so. IP tracking is off (`advanced.ipAddress.disableIpTracking`), so sessions hold no IP address; that also turns off Better Auth's own IP-keyed rate limiter, which is in-memory per isolate on Workers and guards only the Google sign-in routes.
- `e2e/support/sign_in.ts` imports the configuration with a relative path, because Playwright's loader doesn't map `#lib/*.js` to `.ts`.
