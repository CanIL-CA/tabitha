# 0027: One sign-in for every app, against the shared `DB_Auth`, through `@tabitha/auth`

## Status

Proposed. Builds on [0021](./0021-better-auth-sessions-in-d1.md), which put Ontology's Better Auth sessions in `DB_Auth`.

## Context

`apps/sources` needs sign-in and permissions so that its editing features (the generator on the edit page, and whatever follows) can be limited to the people allowed to use them. The same people already sign in to `apps/ontology`, and their permissions already live in `DB_Auth`. That database was built with more than one app in mind: `Permissions` has an `app` column, and `get_user_info()` filters on `'ontology'`.

Everything else about auth belongs to Ontology today:

- `apps/ontology/migrations/auth` owns `DB_Auth`'s schema (Better Auth's `user`, `session`, `account` and `verification` tables, and the `Users`, `Permissions` and `User_Permissions` tables).
- `apps/ontology/src/lib/server/better_auth.ts` holds the Better Auth configuration, with Ontology's hosts hardcoded in `ALLOWED_HOSTS`.
- `apps/ontology/src/lib/server/auth.ts` reads permissions with the app name hardcoded.
- `scripts/dx/grant_permission.ts` and `grant_remote_permission.ts` only know about Ontology.

If Sources copied this code, two apps would write the same tables with configurations and Better Auth versions that could drift apart without anything noticing. That's a correctness risk, not just repeated code.

The same people use both apps, and more apps will need sign-in. Someone signed in to one `tabitha.bible` app should be signed in to all of them, not asked again per app.

## Decision

**Sources binds the same `DB_Auth` D1 database and runs Better Auth itself. The schema, the Better Auth configuration and the permission lookup move into a new package, `@tabitha/auth`, which both apps use. Every app shares one Google client, one `BETTER_AUTH_SECRET` and one session cookie on `tabitha.bible`, so signing in to one app signs in to all of them.**

### `@tabitha/auth`

- **`migrations/`** is the new home of `DB_Auth`'s schema. `0001_better_auth.sql` and `0002_permission_tables.sql` move here from `apps/ontology/migrations/auth` unchanged, so production's `d1_migrations` table still matches them. Each app's `wrangler.jsonc` points `migrations_dir` at `node_modules/@tabitha/auth/migrations`, reaching the package by name instead of a `../../` path. Both apps declare it, so either app's wrangler config can apply it, locally or to production. Production gets `wrangler d1 migrations apply DB_Auth --remote` once, from either app, before code that needs a new migration merges.
- **One migration list for every app.** `Permissions` rows use hand-picked IDs, so new permissions for any app are added here, in order, and never in an app's own folder. `0003` adds Sources' `PROTECTED_ACCESS` (5) and `UPDATE_SOURCE` (6).
- **`create_auth_options()`** is Ontology's current configuration, with the app-specific `allowed_hosts` and the deployment's `cookie_domain` passed in. Google stays the only provider, `basePath` stays `/auth`, OAuth tokens stay encrypted, IP tracking stays off, and the OAuth proxy stays on for Previews. It returns Better Auth's own options and does not wrap Better Auth in an interface of our own ([0014](./0014-no-preemptive-vendor-abstraction-layer.md)).
- **`get_user_permissions({ db_auth, email, app })`** returns the user's `Users.id` and the permission strings for that app. Each app turns the strings into its own flags (`can_add`, `can_update`, …) in its own code, so the package never needs to know an app's permission names.
- **One Better Auth version.** `better-auth` is a dependency of the package, pinned to one version, so both apps always run the version that matches the schema.

The package has two consumers, below the Rule of Three. The reason for extracting it now is the same as for `@tabitha/complex-terms` and for API and database contract types in `@tabitha/types`: two writers of the same tables.

### One sign-in for every app

- **One Google OAuth client.** Ontology's client is renamed "TaBiThA (prod)" and every app's callback is registered on it: `https://ontology.tabitha.bible/auth/callback/google` and `https://sources.tabitha.bible/auth/callback/google`. The dev client that `setup:env` hands out is renamed "TaBiThA (dev)" and has each app's `localhost` callback. Each app's `wrangler.jsonc` `vars` and `.env` carry the same `GOOGLE_OAUTH_CLIENT_ID`, and each app's `GOOGLE_OAUTH_CLIENT_SECRET` secret is that client's.
- **One `BETTER_AUTH_SECRET`.** Every app, and every app's Previews, has the same value, so a session or OAuth proxy payload one app signs is valid in the others. Each app's Google tokens in `account` are encrypted with it too, so any app can read them.
- **One session cookie.** `AUTH_COOKIE_DOMAIN=tabitha.bible` in each app's committed `.env` turns on Better Auth's cross-subdomain cookies, and every app then uses the cookie prefix `tabitha`. Since every app reads sessions from the same `DB_Auth`, a session cookie set by one app is a signed-in session in all of them, and signing out of one signs out of all.
- **The same locally.** Every app's local Cloudflare state lives in one folder at the repo root, `.wrangler/state` (`@tabitha/vite-config/local-state`), instead of one per app. Miniflare names each D1 file after its `database_id`, so both apps' `DB_Auth` is one local database, as in production, and every other database stays its own file. `setup:env` gives every app the same local `BETTER_AUTH_SECRET` and forces `AUTH_COOKIE_DOMAIN` blank in `.env.local`: a browser won't accept a `tabitha.bible` cookie from `localhost`, and a host-only `localhost` cookie already reaches every app, since browsers ignore the port.

### Each app keeps

- **Its own permissions.** Being signed in is shared; being allowed isn't. Each app reads only its own `Permissions.app` grants, so someone with Ontology access who opens Sources is signed in there but still needs Sources' `PROTECTED_ACCESS` for its protected pages.
- **Its own idea of what's protected.** In Sources, `/protected/*` requires `PROTECTED_ACCESS` for `sources`, and the edit page moves under it, to `/protected/edit/<type>/<book>/<chapter>/<verse>`; its old URL redirects there. Verse pages, `/generate` and `/analyze` stay public. `UPDATE_SOURCE` is granted and exposed as `can_update`, ready for saving edits, but nothing checks it yet. Sources' public read APIs stay open: Ontology calls them through a service binding without a user ([0023](./0023-cross-app-calls-via-service-bindings.md)).

### Sources' wiring

The same shape as Ontology's ([0021](./0021-better-auth-sessions-in-d1.md)):

- `wrangler.jsonc`: a `DB_Auth` binding at the top level and under `previews`.
- `hooks.server.ts`: `locals.db_auth` from `DB_Auth.withSession()` for permission reads, and the plain binding for Better Auth itself, so its writes go to the primary. An `authn_handle` and an `authz_handle`, and the rate limiter skips `/protected` and `/auth`.
- `src/env.ts` and `.env`: `BETTER_AUTH_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_PROXY_URL=https://sources.tabitha.bible` and `AUTH_COOKIE_DOMAIN=tabitha.bible`.
- `app.d.ts`: `db_auth` and `user` on `Locals`. The root layout load returns `user`, and a local `auth_client.ts` and sign-in control go in the layout.
- e2e tests sign in with Better Auth's `testUtils`, as in Ontology's `e2e/support/sign_in.ts`.

### Tooling

`grant_remote_permission.ts` requires the app to grant for (`--app=ontology` or `--app=sources`). There's no default: every app's grants live in the same production database, so a production grant names its app. Locally, `grant_permission.ts` (`db:grant`) grants every app's permissions unless `--app` narrows it. `db_load.ts`, `db_status.ts`, `r2_load.ts`, `doctor` and each app's e2e sign-in read the shared local state folder, and `db_load.ts` loads a database two apps bind only once. Each app's e2e suite signs in its own test user (`e2e-<app>@tabitha.local`), since the suites run at once against the one local `DB_Auth`.

## Alternatives considered

- **A dedicated auth app (`apps/auth` at `auth.tabitha.bible`).** It would own `DB_Auth`, the Google client and the sign-in pages, and other apps would check sessions and permissions through a service binding, or each sign in through it as an OpenID provider. That gives one place for the schema and secret, and other apps never touch user tables; as an OpenID provider, no cookie would need to cover every subdomain. Rejected for now: a new app with its own deploys and Previews, and every signed-in request in every app depends on it. A shared cookie gives the same single sign-on with the apps we have. If apps stop being maintained by one team, or the shared cookie's reach becomes a problem, `@tabitha/auth` becomes the core of that app.
- **A separate sign-in per app.** Each app with its own Google client, `BETTER_AUTH_SECRET` and host-only cookie, which keeps a session cookie away from apps that don't need it. Rejected because the same people use every app, and signing in again in each one is friction they'd hit daily.
- **Copy Ontology's auth code into Sources.** No package, but two copies of the configuration and two Better Auth versions writing the same tables, with nothing to catch drift between them.
- **A separate Auth database for Sources.** Full isolation, but every editor's permissions would be granted and revoked in two places, and their `Users.id` would differ between apps.
- **Keep the migrations in `apps/ontology`.** Sources' wrangler config would reach into Ontology's files, and Sources' permissions would be added in Ontology's folder.

## Consequences

- **Every app with access to `DB_Auth` can read and write every user, session and permission**, not just its own. This is acceptable while both apps are maintained by the same team. A dedicated auth app (above) is the fix if that changes.
- **Schema changes affect both apps.** A Better Auth upgrade or plugin that changes the schema updates the package, adds a migration there, applies it to production first, and ships to both apps. Migrations stay additive, so the app deployed second keeps working in between.
- **Locally, `DB_Auth` is shared like in production.** One local grant covers every app, signing in to one local app signs in to all of them, and reloading `DB_Auth` (`db:load` for either app) signs you out of all of them. After pulling this change, a developer runs `bun run db:load` once, since the per-app `apps/<app>/.wrangler/state` folders are no longer read.
- **Two local dev servers can write one SQLite file at once.** A quick experiment showed reads and single writes from two `workerd` processes stay consistent, but a multi-statement batch that loses a lock race fails at once with `SQLITE_BUSY` instead of waiting. Day-to-day local use rarely writes from two apps at the same moment; e2e sign-in retries on it.
- **Two kinds of user records stay.** Better Auth's `user` (text IDs) and the older `Users` (integer IDs) are still matched by email. Ontology stores `Users.id` in `DB_Ontology`, and Sources will do the same for anything it records an author for. Who creates a `Users` row (today only the grant scripts do) is unchanged here, and merging the two tables is out of scope.
- **The session cookie reaches every `tabitha.bible` subdomain**, including `www`, `survey`, and `pr-*` Previews running unmerged code. It's `httpOnly`, so no page script can read it, but every Worker on the domain receives it. Previews already hold production's `BETTER_AUTH_SECRET` and write to production's `DB_Auth` (ADR 0020), so this adds little to what a Preview can already do.
- **A leaked `BETTER_AUTH_SECRET` affects every app**, not one. With every app already writing the same `DB_Auth`, one app's compromise already reached the others.
- **Ontology's signed-in users were signed out once**, when its cookie prefix changed from `better-auth` to the shared `tabitha`. Keeping `better-auth` would have left the old host-only cookie beside the new shared one, and signing out would clear only the shared one.
- **Sources' Previews write user and session rows to production's `DB_Auth`**, as Ontology's already do.
- `apps/www`'s privacy policy is updated to say Sources stores sessions too.
