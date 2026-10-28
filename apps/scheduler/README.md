# Scheduler Worker

A cron-only Cloudflare Worker. It has no UI, no public URL, and no app logic of its own. On each cron in `wrangler.jsonc`, it calls an app's own endpoint through a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), authenticated with a shared `SCHEDULER_TOKEN`. See [ADR 0018](../../docs/decisions/0018-scheduled-work-via-scheduler-worker.md) for why this exists: SvelteKit's Cloudflare adapter only exposes `fetch`, so a `scheduled` export in an app's `hooks.server.ts` is never called.

| Cron | Job |
| --- | --- |
| `0 */12 * * *` (00:00 and 12:00 UTC) | `ontology`'s `POST /scheduled/sync`: complex terms from Google Sheets, then concept embeddings for semantic search |

## Adding a job

1. Put the work in the app, behind a `POST` endpoint that checks the token with the same pattern as `apps/ontology/src/lib/server/scheduled_sync.ts`'s `is_scheduler_authorized`.
2. Add the cron to `wrangler.jsonc`'s `triggers.crons` and map it to a call in `src/index.ts`'s `JOBS_BY_CRON`.
3. For a new app, add a service binding for it under `services` and set `SCHEDULER_TOKEN` on that app's Worker too.

## One-time setup

1. Create the Worker through Workers Builds in the Cloudflare dashboard (**Workers & Pages → Create application → Import a repository**, root directory `apps/scheduler`), which creates the Worker and both build triggers in one step. Then add it to `tools/workers/config.ts` and run that tool, so its build settings stay managed like every other app's. (The Workers Builds API could create the triggers instead, but `tools/workers` doesn't do that yet.)
2. After the first deploy, generate the shared token and set it on both Workers in one command. The final `echo` prints it once, so you can save it to your password manager. Don't run this before the `scheduler` Worker exists: `wrangler secret put` against a missing Worker silently creates an empty one.

   ```bash
   TOKEN=$(openssl rand -hex 32) && echo "$TOKEN" | bunx wrangler secret put SCHEDULER_TOKEN --name ontology && echo "$TOKEN" | bunx wrangler secret put SCHEDULER_TOKEN --name scheduler && echo "$TOKEN"
   ```

## Running a job by hand

To run ontology's sync without waiting for the cron (for example, a first backfill), call the endpoint directly with the token. Keep the `Content-Type` header: without it, SvelteKit's CSRF guard refuses the POST with a 403 before the token is checked.

```bash
curl -X POST -H "Authorization: Bearer $SCHEDULER_TOKEN" -H "Content-Type: application/json" https://ontology.tabitha.bible/scheduled/sync
```

Locally, `bun run dev` starts `wrangler dev --test-scheduled`, and `curl "http://localhost:8787/__scheduled?cron=0+*/12+*+*+*"` fires a cron. The service binding only reaches another Worker running under `wrangler dev`, though, and ontology runs under `vite dev`. So to exercise the sync locally, call ontology's endpoint directly as above, against its local URL.
