# 0027: Sources signs in against the shared `DB_Auth`, through `@tabitha/auth`

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

## Decision

**Sources binds the same `DB_Auth` D1 database and runs Better Auth itself. The schema, the Better Auth configuration and the permission lookup move into a new package, `@tabitha/auth`, which both apps use.**

### `@tabitha/auth`

- **`migrations/`** is the new home of `DB_Auth`'s schema. `0001_better_auth.sql` and `0002_permission_tables.sql` move here from `apps/ontology/migrations/auth` unchanged, so production's `d1_migrations` table still matches them. Each app's `wrangler.jsonc` points `migrations_dir` at `node_modules/@tabitha/auth/migrations`, reaching the package by name instead of a `../../` path. Both apps need it, because each builds its own local `DB_Auth` (see Consequences). Production gets `wrangler d1 migrations apply DB_Auth --remote` once, from either app, before code that needs a new migration merges.
- **One migration list for every app.** `Permissions` rows use hand-picked IDs, so new permissions for any app are added here, in order, and never in an app's own folder. The first new migration adds Sources' permissions under `app = 'sources'`.
- **`create_auth_options()`** is Ontology's current configuration, with the app-specific parts passed in: `allowed_hosts` and `cookie_prefix`. Google stays the only provider, `basePath` stays `/auth`, OAuth tokens stay encrypted, IP tracking stays off, and the OAuth proxy stays on for Previews. It returns Better Auth's own options and does not wrap Better Auth in an interface of our own ([0014](./0014-no-preemptive-vendor-abstraction-layer.md)).
- **`get_user_permissions({ db_auth, email, app })`** returns the user's `Users.id` and the permission strings for that app. Each app turns the strings into its own flags (`can_add`, `can_update`, …) in its own code, so the package never needs to know an app's permission names.
- **One Better Auth version.** `better-auth` is a dependency of the package, pinned to one version, so both apps always run the version that matches the schema.

The package has two consumers, below the Rule of Three. The reason for extracting it now is the same as for `@tabitha/complex-terms` and for API and database contract types in `@tabitha/types`: two writers of the same tables.

### Each app keeps

- **Its own Google OAuth client.** Sources gets a "Sources (prod)" client with `https://sources.tabitha.bible/auth/callback/google` and `http://localhost:1947/auth/callback/google` registered, its own `GOOGLE_OAUTH_CLIENT_ID` in `wrangler.jsonc` `vars`, and its own `GOOGLE_OAUTH_CLIENT_SECRET` secret.
- **Its own `BETTER_AUTH_SECRET`.** Sources' Previews share Sources' production secret, the same way Ontology's do ([0020](./0020-per-pr-worker-previews.md)), so the OAuth proxy works.
- **Its own sign-in and cookies.** Each app signs users in separately. Cookies are per host in production, and each app sets its own `cookie_prefix` so the apps don't overwrite each other's cookies on `localhost`, where browsers ignore the port.
- **Its own idea of what's protected.** In Sources, `/protected/*` requires `PROTECTED_ACCESS` for `sources`, and the editing pages move under it. Sources' public read APIs stay open: Ontology calls them through a service binding without a user ([0023](./0023-cross-app-calls-via-service-bindings.md)).

### Sources' wiring

The same shape as Ontology's ([0021](./0021-better-auth-sessions-in-d1.md)):

- `wrangler.jsonc`: a `DB_Auth` binding at the top level and under `previews`.
- `hooks.server.ts`: `locals.db_auth` from `DB_Auth.withSession()` for permission reads, and the plain binding for Better Auth itself, so its writes go to the primary. An `authn_handle` and an `authz_handle`, and the rate limiter skips `/protected` and `/auth`.
- `src/env.ts` and `.env`: `BETTER_AUTH_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `OAUTH_REDIRECT_PROXY_URL=https://sources.tabitha.bible`.
- `app.d.ts`: `db_auth` and `user` on `Locals`. The root layout load returns `user`, and a local `auth_client.ts` and sign-in control go in the layout.
- e2e tests sign in with Better Auth's `testUtils`, as in Ontology's `e2e/support/sign_in.ts`.

### Tooling

`grant_permission.ts` and `grant_remote_permission.ts` take the app to grant for. `db_load.ts` builds a local `DB_Auth` for Sources, and `setup:env` generates Sources' local `BETTER_AUTH_SECRET`.

## Alternatives considered

- **A dedicated auth app (`apps/auth` at `auth.tabitha.bible`).** It would own `DB_Auth`, the Google client and the sign-in pages, and other apps would check sessions and permissions through a service binding. That gives one place for the schema and secret, and other apps never touch user tables. Rejected for now: a new app with its own deploys and Previews, and every signed-in request in every app depends on it. If a third app needs auth, or single sign-on becomes a goal, `@tabitha/auth` becomes the core of that app, so this decision doesn't close that door.
- **Single sign-on through a `.tabitha.bible` cookie.** Signing in once for every app would need one `BETTER_AUTH_SECRET` everywhere and Better Auth's cross-subdomain cookies. The session cookie would then go to every subdomain, including `www`, `survey`, and `pr-*` Previews running unmerged code. Rejected until signing in separately is an actual problem.
- **Copy Ontology's auth code into Sources.** No package, but two copies of the configuration and two Better Auth versions writing the same tables, with nothing to catch drift between them.
- **A separate Auth database for Sources.** Full isolation, but every editor's permissions would be granted and revoked in two places, and their `Users.id` would differ between apps.
- **Keep the migrations in `apps/ontology`.** Sources' wrangler config would reach into Ontology's files, and Sources' permissions would be added in Ontology's folder.

## Consequences

- **Every app with access to `DB_Auth` can read and write every user, session and permission**, not just its own. This is acceptable while both apps are maintained by the same team. A dedicated auth app (above) is the fix if that changes.
- **Schema changes affect both apps.** A Better Auth upgrade or plugin that changes the schema updates the package, adds a migration there, applies it to production first, and ships to both apps. Migrations stay additive, so the app deployed second keeps working in between.
- **Locally, each app has its own `DB_Auth`.** Miniflare keeps D1 state in each app's own `.wrangler/state`, so the local databases are separate even though production's is shared. A developer grants permissions in each app they work on.
- **Two kinds of user records stay.** Better Auth's `user` (text IDs) and the older `Users` (integer IDs) are still matched by email. Ontology stores `Users.id` in `DB_Ontology`, and Sources will do the same for anything it records an author for. Who creates a `Users` row (today only the grant scripts do) is unchanged here, and merging the two tables is out of scope.
- **Each app's stored Google tokens are encrypted with its own secret.** Signing in to one app overwrites the `account` row the other wrote, and neither app can decrypt the other's tokens. Nothing reads those tokens today; anything that starts to will have to handle that.
- **Sources' Previews write user and session rows to production's `DB_Auth`**, as Ontology's already do.
- `apps/www`'s privacy policy is updated to say Sources stores sessions too.
