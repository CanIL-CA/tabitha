# Ontology e2e tests

Standard Playwright specs (`bun run test:e2e`), with one addition: `/protected/*` routes are reachable in tests without ever going through Google OAuth.

## 🔑 How authenticated tests work

`auth.setup.ts` runs once before the suite (wired in via `playwright.config.js`'s `globalSetup`) and calls `support/sign_in.ts`'s `sign_in_as()`, which:

1. Runs `bun run db:grant e2e-test@tabitha.local`, giving that fixture account every Ontology permission in your local Auth D1 — the same command described in the root `CONTRIBUTING.md`.
2. Opens that same local Auth D1 through wrangler's `getPlatformProxy()`, and builds a test-only Better Auth instance from the app's own configuration plus Better Auth's [`testUtils`](https://www.better-auth.com/docs/plugins/test-utils) plugin.
3. Saves the user (reusing it if an earlier run already did), creates a real session row, and adds the session cookie to the browser context, which is saved to `e2e/.auth/user.json` (gitignored).

Every test then runs with that `storageState` already applied (see `playwright.config.js`'s `use.storageState`), so `page.goto('/protected/...')` just works — no login step needed in the test itself. A spec that needs a second identity calls `sign_in_as()` on its own context (see `suggested_changes_approval.spec.ts`).

See [`docs/decisions/0021-better-auth-sessions-in-d1.md`](../../../docs/decisions/0021-better-auth-sessions-in-d1.md) for why, and [ADR 0006](../../../docs/decisions/0006-e2e-auth-bypass-via-signed-session-cookie.md) for why tests don't automate a real Google sign-in.

## 📋 Requirements

- `apps/ontology/.env.local` must have a real `BETTER_AUTH_SECRET` (from `bun run setup:env`) — the same secret the dev server uses, since the session cookie is signed with it.
- The local Auth D1 must exist with Better Auth's tables (`bun run db:load:ontology` loads it and applies `migrations/auth/`).
- `bun` must be on `PATH` (same requirement as `bun run db:grant`/`db:load` generally).

## ⚠️ Don't use `context.setOffline()` to simulate offline in this app

This app registers a service worker, and Playwright/Chrome's `context.setOffline(true)` interacted badly with the earlier `vite-plugin-pwa` one: confirmed directly, it stalled page reactivity entirely — even a plain form field edit stopped updating component state, unrelated to any app code. That hasn't been rechecked with the native worker (`@tabitha/service-worker`), so keep simulating offline by failing the specific request:

```ts
await page.route('**/protected/concept/update/submit', route => route.abort('internetdisconnected'))
```

See `e2e/offline_queue.spec.ts` for a full example.

## 🧯 If a protected-route test starts failing with a 401/redirect-to-login

- Confirm `BETTER_AUTH_SECRET` in `.env.local` matches what the running dev server loaded (a stale copy from a different environment won't verify).
- Confirm the local Auth D1 has Better Auth's tables (`bun run db:status`, or re-run `bun run db:load:ontology`). A `no such table: user` error from `auth.setup.ts` means the migrations weren't applied.
- Re-run `bun run db:grant e2e-test@tabitha.local` by hand and check its output — if the local Auth D1 was just reloaded from a snapshot, grants reset with it.
