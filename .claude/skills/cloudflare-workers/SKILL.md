---
name: cloudflare-workers
description: Cloudflare Workers, Cloudflare D1 (SQLite), R2 storage, and Wrangler 4 development skill. TRIGGER when writing, configuring, inspecting, or debugging Cloudflare Worker endpoints, SvelteKit Cloudflare adapter code, D1 database queries, R2 bucket storage, wrangler.jsonc files, or local Miniflare emulation.
metadata:
  version: 4.x
---

# Cloudflare Workers, D1 & R2 Best Practices

Guidelines for developing, deploying, and maintaining Cloudflare Workers, D1 SQLite databases, and R2 storage in the TaBiThA monorepo.

---

## 1. Cloudflare D1 (SQLite at the Edge)

### Query Execution Methods
- **Single row / scalar**: `.first<T>()` or `.first<T>('column_name')`
  ```typescript
  const user = await db.prepare('SELECT * FROM Users WHERE id = ?').bind(user_id).first<DbUser>()
  ```
- **Multiple rows**: `.all<T>()`
  ```typescript
  const { results } = await db.prepare('SELECT * FROM Concepts WHERE stem LIKE ? LIMIT 50').bind(pattern).all<DbConcept>()
  ```
- **Mutation (INSERT/UPDATE/DELETE)**: `.run()`
  ```typescript
  const result = await db.prepare('UPDATE Users SET name = ? WHERE id = ?').bind(name, id).run()
  ```
- **Atomic Batches (Transactions)**: Use `db.batch([...])` to execute multiple queries in a single transaction round-trip:
  ```typescript
  await db.batch([
  	db.prepare('INSERT INTO Logs (msg) VALUES (?)').bind('User updated'),
  	db.prepare('UPDATE Accounts SET status = ? WHERE id = ?').bind('active', account_id)
  ])
  ```

### Session Consistency & Bookmarking (`withSession`)
When performing sequential read-after-write operations across distributed edge nodes, use D1 Sessions to guarantee monotonic read consistency:
```typescript
const session = db.withSession(token)
const result = await session.prepare('SELECT ...').all()
const next_token = session.latestCommitToken
```
Ensure `"placement": { "mode": "off" }` in `wrangler.jsonc` when utilizing session tokens.

---

## 2. Local D1 & Miniflare Emulation

- Local D1 SQLite files are stored by Miniflare at:
  `apps/<app>/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<sha256(database_id)>.sqlite`
- Use `bun run db:load` (`scripts/dx/db_load.ts`) to stream SQL snapshot dumps directly into Miniflare state in ~1-2 seconds.
- Inspect local database health, tables, and row counts via `bun run db:status`.

---

## 3. Cloudflare R2 Object Storage

- Use typed R2 bucket bindings from `platform.env`:
  ```typescript
  // Upload object
  await env.R2_db_backups.put(filename, stream, {
  	httpMetadata: { contentType: 'application/x-sqlite3' },
  	customMetadata: { timestamp: String(Date.now()) }
  })

  // Download object
  const object = await env.R2_db_backups.get(filename)
  if (object) {
  	const body = await object.arrayBuffer()
  }
  ```

### Creating and Configuring Buckets -- via `tools/r2`, Not the Dashboard

Every bucket the account holds, and why its public-access setting is what it is, is declared in `tools/r2/config.ts` -- add a new bucket (or change an existing one's access) by editing that file and running `bun run apply:run` from `tools/r2`, not by clicking through the dashboard's bucket-creation flow. See `tools/r2/README.md`.

Not every R2 use case needs a Worker binding -- a bucket can serve anonymous HTTPS GETs directly, with no authentication and no deployed Worker in front of it, either via Cloudflare's shared `r2.dev` subdomain (`db-migration-data`, which replaced Git LFS tracking of `tools/databases/raw/`+`snapshots/` in a public repo -- see `tools/databases/migrations/r2_sync.ts`) or via a dedicated custom domain (`db-backups`, whose objects ontology's `/downloads` page links to directly). `tools/r2/config.ts`'s `access` field models both. Reads need no Cloudflare credentials at all; only writes (`wrangler r2 object put`/`delete`) do.

Under the hood, `apply.ts` shells out to `wrangler r2 bucket create`/`dev-url enable`/`domain add`, passing `--force` to skip the interactive "contents will be made publicly available" confirmation prompt each of those commands has -- which is also why running one of them *by hand* (outside the tool) tends to trip Claude Code's auto-mode classifier; switch to manual permission mode for that rather than routing around the block. Since `apply.ts` skips the prompt programmatically, double-check `config.ts`'s `access`/`reason` fields are actually right before running `apply:run` -- there's no confirmation step to catch a mistake once the tool itself is running.

---

## 4. Wrangler 4 Configuration (`wrangler.jsonc`)

- **JSONC format**: Keep JSON with comments clean and valid.
- **`compatibility_flags`**: Always include `["nodejs_compat"]`.
- **`compatibility_date`**: Keep synchronized with today's date via `bun run update:safe`.
- **Dedicated Local Dev Ports**:
  - Ontology: `3056`
  - Targets: `1382`
  - Sources: `1947`
  - Editor: `1337`
  - Copilot: `9000`
  - Www: `1455`
  - Scheduler: none (a plain, cron-only Worker with no dev server)
- **Cron triggers never go on a SvelteKit app.** `@sveltejs/adapter-cloudflare`'s generated Worker only exports `fetch`, so a `scheduled` export in `hooks.server.ts` (or a `triggers.crons` entry in a SvelteKit app's `wrangler.jsonc`) is silently never called. Put the work behind a token-checked `POST` endpoint in the app, and add a cron plus a job to `apps/scheduler`, which calls it through a service binding. See [ADR 0018](../../../docs/decisions/0018-scheduled-work-via-scheduler-worker.md) and `apps/scheduler/README.md`.
- Validate all workspace configurations with `bun run check:cloudflare`.

---

## 5. Workers Builds Git Integration (Monorepo Cutover)

Every app deploys to production via Cloudflare Workers Builds (dashboard-configured git integration), not any script or GitHub Actions step in this repo. The [Workers Builds API](https://developers.cloudflare.com/api/resources/workers_builds) can now create repo connections (`PUT /accounts/{account_id}/builds/repos/connections`) and triggers (`POST /accounts/{account_id}/builds/triggers`), but a trigger needs the Worker's tag (`external_script_id`), so the Worker has to exist first, and `tools/workers` doesn't create triggers yet. Until it does, connecting a new Worker is a one-time dashboard action that creates the Worker and its production trigger in one step (then turn off its preview builds, see below): **Workers & Pages -> Create application -> Import a repository** -> select `CanIL-CA/tabitha` (this monorepo -- several apps still have their git integration pointed at their old, now-legacy standalone single-app repos; cutting one over means reconnecting that Worker's integration to this monorepo instead).

The **Build command**/**Deploy command**/**Variables** below are per-Worker settings stored in Cloudflare, not in this repo, so a tooling change in git (package manager, build script) doesn't reach them on its own. Update them through `tools/workers` (below) in the same change.

**Every Worker uses Workers Builds' Worker Previews model with preview builds turned off ([ADR 0020](../../../docs/decisions/0020-per-pr-worker-previews.md)).** Workers Builds only deploys production from `main`; CI builds each PR's Worker Previews itself (`wrangler preview --name pr-<N>`). A Worker on this model has a single trigger, the production one. Moving a Worker onto it is one-way: Settings -> Builds -> "Set up Worker Previews", then turn off "Builds for Preview branches" (`previews_enabled: false` in `GET /accounts/{account_id}/builds/workers/{tag}`). `tools/workers` refuses a Worker that still has a second trigger and reports one whose preview builds are on.

**History: under the older model, the dashboard's single settings page silently edited only ONE of two separate build triggers per Worker -- confirmed 2026-09-02 via the Workers Builds API (`GET /accounts/{account_id}/builds/workers/{worker_tag}/triggers`), not guesswork.** Every Worker had two independent trigger configs: one for the production branch (`branch_includes: ["main"]`) and one named "Deploy non-production branches" (`branch_includes: ["*"]`, `branch_excludes: ["main"]`) that fires for every PR/feature branch. The dashboard's "Build configuration" section *looks* like one shared panel, but editing **Build command** and **Build Variables** there only writes to the production trigger -- the non-production trigger's `build_command`/environment variables are left completely untouched, with no way to reach them through that simplified view. (**Deploy command** and **Non-production branch deploy command**/"Version command" *do* correctly write to their respective triggers -- it's specifically Build command and Build Variables that don't propagate to the non-production side.) This produces a confusing, highly reproducible symptom: a PR's preview build keeps executing a stale `pnpm run build` and shows `Build variables: None` in its build snapshot no matter how many times the dashboard is re-saved, or how many fresh builds are triggered (ruling out a save-timing race) -- because there's a second, hidden config the UI never touches. `apps/copilot` hit exactly this during the pnpm-to-Bun migration.

**Under that model, the fix required the Workers Builds API directly -- there was no dashboard path to the non-production trigger's Build command/Variables.** With an API token scoped to `Workers Builds Configuration:Edit`, created as a **User** API Token (My Profile -> API Tokens) -- confirmed 2026-09-02 that the Workers Builds API rejects Account-Owned tokens outright with a generic `401 Invalid token` regardless of permissions granted (a known, currently-unsupported limitation, not a scoping mistake -- see the Cloudflare Community bug report linked from `tools/workers/.env`):
1. `GET /accounts/{account_id}/workers/scripts` to find the target Worker's `tag`.
2. `GET /accounts/{account_id}/builds/workers/{tag}/triggers` -- returns both triggers; the one with `branch_excludes: ["main"]` is the non-production one that needs fixing.
3. `PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}` with `{"build_command": "..."}` to fix the build command on that specific trigger (PATCH is a true partial update -- other fields like `path_includes`/`branch_includes` are left alone).
4. `PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables` with `{"VAR_NAME": {"value": "...", "is_secret": false}}` to add any Build Variables (e.g. `SKIP_DEPENDENCY_INSTALL`, see below) that the dashboard also failed to propagate.
5. Optionally verify immediately with a manual trigger: `POST /accounts/{account_id}/builds/triggers/{trigger_uuid}/builds` with `{"branch": "...", "commit_hash": "..."}`, then poll `GET /accounts/{account_id}/builds/workers/{tag}/builds` (status field) and `GET /accounts/{account_id}/builds/builds/{build_uuid}/logs` (full log lines) until it resolves.

**`tools/workers` now automates the steps above.** Rather than doing this by hand per app, `bun run apply` (from `tools/workers`) prints a plan of every drifted field -- build command, deploy command, build cache, watch paths, and managed Build Variables -- on the production trigger for every app in its `config.ts`, and `bun run apply:run` applies it. See `tools/workers/README.md`. The manual API steps above are still the right mental model for understanding *why* a dashboard re-save doesn't fix this, and for one-off debugging, but routine fixes/rollouts should go through the tool, not hand-run `curl`.

**Cloudflare's automatic dependency-install step does not reliably detect `bun.lock`** -- Bun's own text-based lockfile format since 1.2, and what this repo uses. Cloudflare's lockfile autodetection was built around the older binary `bun.lockb`; multiple current reports (e.g. the Cloudflare community thread "Pages automatic dependency install does not detect bun.lock") describe it falling back to `npm install` instead, which then fails outright on a Bun-only workspace. The fix, not a cosmetic preference: set the **Build Variable** `SKIP_DEPENDENCY_INSTALL=true` (Settings -> Build -> Variables and secrets) so Cloudflare's own auto-install step never runs, and make the **Build command** self-sufficient by having it install first.

Use these settings, established while deploying `apps/www` (2026-08), updated for the Bun migration (2026-09):

- **Project name**: must match the app's `wrangler.jsonc` `"name"` field exactly -- this is what the Worker actually deploys as, and it's what any `routes`/`custom_domain` entries in that same `wrangler.jsonc` are attached to.
- **Build Variables**: `SKIP_DEPENDENCY_INSTALL=true` -- see above; without it, Cloudflare's own pre-build install step runs first, doesn't recognize `bun.lock`, and fails before the Build command below ever executes.
- **Build command**: `bun install && bun run build` -- not `npm run build`. This is a Bun workspace; npm won't resolve it correctly, and Cloudflare's autodetect defaults to npm regardless, so this needs manually correcting every time. The `bun install &&` prefix is required because of the `SKIP_DEPENDENCY_INSTALL` setting above -- Cloudflare's build image does have Bun preinstalled, it just won't invoke it automatically for this lockfile format.
- **Deploy command**: `bunx wrangler deploy` -- not `npx wrangler deploy`.
- **Preview builds**: off, after switching the Worker to Worker Previews (see above). CI deploys PR previews.
- **Path / root directory**: `apps/<name>` -- without this, the build runs from the repo root and picks up the root `turbo run build` (which builds every app), not the target app's own build script.
- **API token**: reuse one shared token across every app's Workers Builds connection rather than creating a new one per app. Cloudflare's "Workers Scripts: Edit" permission is account-wide -- there is no way to scope it to a single Worker -- so a per-app token provides no real blast-radius reduction, just more credentials to manage. (Whatever token Cloudflare auto-creates inline in this flow is consumed entirely by its own build pipeline and never surfaced to you to copy elsewhere -- that's expected, not a bug.)
- **Build cache** (Settings -> Build, near the bottom): leave it on. `apps/www` has it enabled; match that for every app cut over after it.
- **Build watch paths** (Settings -> Build -> Build watch paths, set right after connecting): Cloudflare defaults a new Workers Build to include paths `[*]` and excludes `[]`, meaning it builds on every push to the repo regardless of which files changed -- in a monorepo this means every app's Workers Build fires on every PR, including ones that only touch an unrelated app or `tools/`. There is no `wrangler.jsonc` field for this setting; `tools/workers` applies each app's derived watch paths to the production trigger through the Workers Builds API, so add a new app to its `config.ts` rather than entering paths in the dashboard. Work out the include list from what the app's build script (usually just `vite build`) actually loads: the app's own directory (`apps/<name>/*`), every `@tabitha/*` workspace package it depends on at build time via its `dependencies` and any build-tool packages under `devDependencies` that its `vite.config.ts`/`svelte.config.js` import (e.g. `@tabitha/vite-config`) -- but not dev-only tooling like `@tabitha/eslint-config`/`@tabitha/tsconfig` that only `check`/`lint` scripts use, since those aren't part of the Workers Build pipeline -- plus root `package.json` and `bun.lock` (a Bun workspace install resolves the whole monorepo, so either can change what the app builds with even without touching `apps/<name>/` itself). `apps/www`'s list, done 2026-08-29, is a worked example: `apps/www/*`, `packages/types/*`, `packages/api-client/*`, `packages/ui/*`, `packages/vite-config/*`, `package.json`, `bun.lock`.

**Never run `wrangler deploy` manually against production for an app cut over to Workers Builds -- push an empty commit instead.** Vite loads `.env.local` over the committed `.env` in every mode, including a production `vite build`, so a local build run from any developer's own checkout silently bakes that developer's local-dev overrides (e.g. `PUBLIC_ONTOLOGY_API_HOST=http://localhost:5173`) into the production bundle instead of the committed prod values -- with no error at deploy time, since the Worker still deploys and runs fine, just with unreachable API hosts. This bit `editor` in production on 2026-08-31: it had never had a Workers Build actually run, so a manual `wrangler deploy` was used to ship a fix, and that deploy baked in `http://localhost:5173` for `PUBLIC_ONTOLOGY_API_HOST` -- every ontology/forms API call then failed and was silently swallowed to an empty result by the shared `http.ts` client's `!res.ok -> null` fallback, so the checker showed literally every word as "not recognized," with no crash or visible error to point at the cause. If an app needs deploying and hasn't had a Workers Build run yet (or you need to force a fresh one), trigger the real pipeline instead: `git commit --allow-empty -m "..."; git push origin main` -- CI always clones fresh from git, so `.env.local` (gitignored, dev-machine-only) is never present and the build can only ever see the committed `.env`. The one narrow exception is rotating a secret via `wrangler secret put <NAME>`, which creates a new deployment but does not rebuild the bundle -- safe for secrets alone, but never reach for a full local `wrangler deploy` to fix an env-var or code issue, even under incident pressure.

**Custom domain claim failure**: if the target hostname (e.g. a bare apex like `tabitha.bible`) already has DNS records that predate its Workers Custom Domain -- typically leftover `A`/`CNAME` records from before the zone moved to Cloudflare -- the deploy will partially fail with `Hostname '...' already has externally managed DNS records (A, CNAME, etc). Delete them first or try a different hostname.` The Worker itself still deploys fine in this case (check `wrangler deployments list`); only the custom-domain trigger fails. Fix: delete the conflicting records from the zone's DNS tab, then retrigger the build (push a new commit, or trigger a rebuild from the dashboard).

**Zone-level config** (DNS records, redirect rules) is managed separately from all of the above, via `tools/dns` -- see that package's README. It reconciles specific, named records/rules against the live Cloudflare API and is safe to run repeatedly; it deliberately never does a whole-zone listing-and-reconciliation, so it can't touch anything it doesn't explicitly declare.
