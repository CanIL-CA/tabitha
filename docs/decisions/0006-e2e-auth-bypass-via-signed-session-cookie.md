# 0006: Bypass Google OAuth in e2e tests via a signed session cookie

## Status

Superseded by [0021](./0021-better-auth-sessions-in-d1.md). Ontology moved to Better Auth with sessions in D1, and e2e signs in with Better Auth's `testUtils` plugin instead of a hand-signed cookie.

## Context

`apps/ontology` gates every `/protected/*` route behind Auth.js (`@auth/sveltekit`) with a single Google OAuth provider and no dev bypass. Before this decision, the monorepo had no e2e coverage of anything behind that gate at all -- every existing Playwright spec in every app stuck to public routes, specifically because there was no way to get a test run signed in.

Automating a real Google sign-in in CI is impractical (a real Google account, MFA/consent-screen friction, and a dependency on an external identity provider's UI) and undesirable (it would mean tests exercising Google's login flow instead of the app).

## Decision

Playwright's `globalSetup` (`apps/ontology/e2e/auth.setup.ts`) mints a valid Auth.js session directly and saves it as a `storageState`, which every test then reuses:

1. Grant a fixed test account (`e2e-test@tabitha.local`) Ontology permissions in the local Auth D1, by shelling out to the same `pnpm db:grant` tool a developer runs by hand (see ADR-adjacent `CONTRIBUTING.md` section on local permissions).
2. Sign a session JWT with `@auth/core/jwt`'s `encode()`, using the app's own `AUTH_SECRET` and a `salt` equal to the exact cookie name Auth.js expects (`authjs.session-token` for local, unencrypted http) -- confirmed directly against the installed `@auth/core` source, not assumed.
3. Set that value as a cookie on a fresh browser context and save it via `context.storageState()`.

No application code changes: this works because Auth.js's default `jwt`/`session` callbacks are pure passthroughs of the token's `email`/`name`/`picture` fields, and this app doesn't override either callback.

## Alternatives considered

- **Automate the real Google OAuth flow in tests.** Rejected: impractical to run headlessly/in CI, and it would make tests fragile to Google's own UI rather than testing this app.
- **Add a dev-only credentials provider or auth bypass in application code.** Rejected: this repo has an explicit preference against dev-only branches living in production application code (see the `tabitha-no-dev-branches-in-prod-code` note from the same effort that led here) -- the fix belongs entirely in test/dev tooling, not `hooks.server.ts`.

## Consequences

- Any `/protected/*` route is now testable without touching Google, in CI or locally, with the standard Playwright `storageState` pattern.
- The technique is Auth.js-JWT-strategy-specific -- if this app ever switches to database-backed sessions, `auth.setup.ts` needs a different approach (inserting a real session row instead of signing a cookie).
- The test account (`e2e-test@tabitha.local`) is a permanent fixture in each developer's/CI's local Auth D1, re-granted idempotently by `auth.setup.ts` on every test run.
