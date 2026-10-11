# 0018: App-owned scheduled work runs through a `scheduler` Worker

## Status

Accepted (2026-09-26)

## Context

**A `scheduled` export in a SvelteKit app's `hooks.server.ts` is never called.** SvelteKit only calls the hooks it knows about (`handle`, `handleError`, `init`, and so on), and `@sveltejs/adapter-cloudflare`'s generated Worker (`.svelte-kit/cloudflare/_worker.js`) exports only `fetch`. The function is bundled into the build output and reachable from nothing. A Cloudflare cron trigger on such an app fires into a Worker with no `scheduled` handler at all. The official adapter has never supported this ([sveltejs/kit#4841](https://github.com/sveltejs/kit/issues/4841), still being requested in 2026), and 7.2.9 is the latest release as of this writing.

That is how `apps/ontology`'s 12-hour complex-terms sync quietly stopped running. It started in 2024 as its own standalone Worker, where `scheduled` works natively. On 2026-08-07 it moved into `hooks.server.ts` as `export async function scheduled`, and from then on it only ran when someone pressed the "Sync Complex Terms Now" button, which calls the same sync function directly and so made the sync look healthy. It surfaced on 2026-09-26, when [ADR 0016](./0016-semantic-search-via-vectorize-embeddings.md)'s embedding sync, added to that same hook, never filled its index after the 12:00 UTC cron.

The obvious alternative, a GitHub Actions scheduled workflow calling the app (as `db_backup.yml` and `d1_cleanup.yml` already do), was rejected on principle. Work that is built into a running app shouldn't depend on a CI system to happen.

## Decision

- **The work stays in the app.** Recurring work that belongs to an app lives in that app, behind a `POST` endpoint that accepts only a shared `SCHEDULER_TOKEN`. An unset token rejects everything. Ontology's is `POST /scheduled/sync`, which runs the complex-terms sync and then the embedding sync.
- **One cron-only Worker triggers it.** `apps/scheduler` is a plain Cloudflare Worker, not SvelteKit, that holds every cron. Each cron maps to a job (`JOBS_BY_CRON`) that calls the owning app's endpoint through a service binding. It has no UI, no public URL (`workers_dev: false`), and no app logic. Jobs are awaited, so a failed sync marks that cron run as failed in Cloudflare's cron history instead of looking successful.
- **GitHub Actions verifies code; it doesn't run app work on a schedule.** CI stays on GitHub Actions. `db_backup` and `d1_cleanup` stay on GitHub Actions on purpose. They are repo-owned maintenance tools (Bun scripts in `tools/databases` that use the `wrangler` CLI and read the apps' `wrangler.jsonc` files), not work built into a running app, so the principle above doesn't apply to them. Moving the backup would mean rewriting it for a Worker (REST export plus a WASM SQLite) and still holding an API token, and GitHub already reports a failed run.

## Alternatives considered

- **A GitHub Actions scheduled workflow calling the endpoint.** Rejected for the reason above. It would also put the token in a GitHub secret, and GitHub runs schedules on a best-effort basis (runs can be late, and a public repo's schedules are disabled after 60 days without activity).
- **Moving off GitHub Actions entirely.** Rejected. Workers Builds runs one build command per app. It has no PR-level orchestration: no cross-app e2e, no Windows runner, no PR summary comment, and no required status checks. [ADR 0015](./0015-cross-app-preview-custom-domains.md)'s preview stack exists because Workers Builds couldn't do it.
- **A custom Worker entry that wraps SvelteKit's `_worker.js`** (pointing `wrangler.jsonc` `main` at a file that re-exports `fetch` and adds `scheduled`). This works, but it's app code built outside SvelteKit, where `$lib`/`$env` imports don't resolve. We want to keep the apps purely SvelteKit.
- **Appending a handler to `_worker.js` after the build.** Fragile: a plain `vite build` silently drops it ([flo-bit/contrail#63](https://github.com/flo-bit/contrail/issues/63)).
- **A community fork of the adapter** that merges extra handlers. Rejected as a third-party dependency for something one small Worker does.
- **A separate cron Worker per app.** Rejected: more Workers, each with its own Workers Builds setup, for no benefit. One `scheduler` with one cron table is simpler.

## Consequences

- **`scheduler` is the first non-SvelteKit app**, so repo tooling built around SvelteKit apps needed a pass. CONTRIBUTING.md now has a "How to Add a New App" checklist that separates what every app needs from what only SvelteKit apps or only plain Workers need.
- **One-time setup per environment:** create `scheduler` through Workers Builds' dashboard import (the Workers Builds API can create triggers too, but `tools/workers` doesn't yet), add it to `tools/workers/config.ts`, and set `SCHEDULER_TOKEN` on both Workers after `scheduler` first deploys (see `apps/scheduler/README.md`).
- **The binding between the Workers isn't a package dependency,** so CI won't re-check `scheduler` when only `ontology` changes. The contract is small, covered from both sides: ontology's tests cover the token check and sync order, and scheduler's tests cover the URL and header it sends. Changing the endpoint's path or auth means updating both.
- **Service bindings return, in a narrow role.** ADR 0015 rejected service bindings for cross-app *preview* calls. This is production-only: `scheduler` has no preview environment, and its preview builds only upload versions, which never run crons.
- **Local development can't exercise the binding.** Ontology runs under `vite dev`, which a `wrangler dev` service binding can't reach, so the scheduled sync is tested locally by calling the endpoint directly.
- **Revisit** if the official adapter gains native `scheduled` support (then the work could move back into each app).
