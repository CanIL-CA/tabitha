# TaBiThA Workers (`@tabitha/workers`)

Reconciles each TaBiThA app's Cloudflare **Workers Builds** production trigger -- build command, deploy command, watch paths, build cache, and Build Variables -- against `config.ts`, and reports any Worker whose Workers Builds preview builds are switched on. Settings edited in the dashboard drift silently, and an older Workers Builds model hid a second trigger the dashboard couldn't reach at all; full writeup in the `cloudflare-workers` skill's "Workers Builds Git Integration" section.

Every Worker is on Workers Builds' Worker Previews model with preview builds turned off: Workers Builds only deploys production from `main`, and CI builds each PR's Worker Previews ([ADR 0020](../../docs/decisions/0020-per-pr-worker-previews.md)). A Worker on that model has exactly one trigger. This tool refuses a Worker with a second trigger, which means it's still on the older model. Switch it in the dashboard first (Settings -> Builds -> "Set up Worker Previews", which can't be undone), then turn off "Builds for Preview branches".

This tool is deliberately narrow. It only manages the fields listed above. It never touches `branch_includes`, `path_excludes`, `root_directory`, or any Build Variable it doesn't itself declare in `managed_environment_variables` -- anything else already set, by hand or otherwise, is left alone. It reports preview builds being on without changing them, because the Workers Builds API for that setting is undocumented.

## What's out of scope here

- **Compatibility flags and placement mode** (Smart Placement) are controlled by each app's `wrangler.jsonc` instead, applied authoritatively on every `wrangler deploy`/`wrangler preview` -- not part of the Workers Builds trigger API this tool talks to, and not drift-prone the way trigger config is. Fix those by editing `wrangler.jsonc`, not here.
- **Creating a new Worker's trigger.** This tool only reconciles triggers that already exist. The [Workers Builds API](https://developers.cloudflare.com/api/resources/workers_builds) can create them (`POST /accounts/{account_id}/builds/triggers`, which needs the Worker's tag, the repo connection UUID, and a build token UUID -- the last two reusable from any existing app's trigger), but that isn't built here yet. Until it is, a new Worker gets its trigger from the one-time dashboard import (Workers & Pages -> Create application -> Import a repository), which also creates the Worker itself. New Workers start on the Worker Previews model with preview builds on, so turn them off.
- **`worker_tag`** (the per-Worker identifier `config.ts` needs to look up a Worker's triggers) isn't derivable by this tool's own token -- see the comment on `DesiredApp.worker_tag` in `config.ts`.

## Usage

1. Set `CLOUDFLARE_API_TOKEN` in `.env.local` -- see the comment above it in the committed `.env` for the exact token name/permission. Unlike `tools/dns`/`tools/gateway`'s tokens, this one has to be a **User** API Token (My Profile -> API Tokens): the Workers Builds API doesn't yet support Account-Owned tokens at all, and rejects them with a generic `401 Invalid token` regardless of permissions. `CLOUDFLARE_ACCOUNT_ID` is already set in the committed `.env`.
2. Run `bun run apply` to print a plan -- what would change, per app, plus any ⚠️ problem to fix in the dashboard -- without writing anything. Safe to run any time.
3. Run `bun run apply:run` to actually apply those changes.

`config.ts` is the durable, versioned desired state -- change a build/deploy command or a managed Build Variable by editing it and re-running `bun run apply:run`, not by hand-editing anything in the Cloudflare dashboard. Watch paths aren't hand-maintained at all: `apply.ts` derives them from each app's own `package.json` workspace dependencies, so a newly added dependency is picked up automatically on the next run.
