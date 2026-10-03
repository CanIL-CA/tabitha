# TaBiThA Workers (`@tabitha/workers`)

Reconciles each TaBiThA app's Cloudflare **Workers Builds** trigger settings -- build command, deploy command, watch paths, build cache, and Build Variables -- against `config.ts`. Exists because Cloudflare's dashboard has a real, non-obvious gap: every Worker actually has *two* separate build triggers (one for its production branch, one named "Deploy non-production branches" that fires for every other branch/PR), and the dashboard's single settings page only ever writes **build command** and **Build Variables** edits to the production trigger -- the non-production trigger's copies are left completely stale with no way to reach them through the UI at all. Full writeup in the `cloudflare-workers` skill's "Workers Builds Git Integration" section.

This tool is deliberately narrow. It only manages the fields listed above, and only for the two triggers on each app declared in `config.ts`. It never touches `branch_includes`, `path_excludes`, `root_directory`, or any Build Variable it doesn't itself declare in `managed_environment_variables` -- anything else already set, by hand or otherwise, is left alone.

## What's out of scope here

- **Compatibility flags and placement mode** (Smart Placement) are controlled by each app's `wrangler.jsonc` instead, applied authoritatively on every `wrangler deploy`/`versions upload` -- not part of the Workers Builds trigger API this tool talks to, and not drift-prone the way trigger config is. Fix those by editing `wrangler.jsonc`, not here.
- **Creating a new Worker's triggers.** This tool only reconciles triggers that already exist. The [Workers Builds API](https://developers.cloudflare.com/api/resources/workers_builds) can create them (`POST /accounts/{account_id}/builds/triggers`, which needs the Worker's tag, the repo connection UUID, and a build token UUID -- the last two reusable from any existing app's trigger), but that isn't built here yet. Until it is, a new Worker gets its triggers from the one-time dashboard import (Workers & Pages -> Create application -> Import a repository), which also creates the Worker itself.
- **`worker_tag`** (the per-Worker identifier `config.ts` needs to look up a Worker's triggers) isn't derivable by this tool's own token -- see the comment on `DesiredApp.worker_tag` in `config.ts`.

## Usage

1. Set `CLOUDFLARE_API_TOKEN` in `.env.local` -- see the comment above it in the committed `.env` for the exact token name/permission. Unlike `tools/dns`/`tools/gateway`'s tokens, this one has to be a **User** API Token (My Profile -> API Tokens): the Workers Builds API doesn't yet support Account-Owned tokens at all, and rejects them with a generic `401 Invalid token` regardless of permissions. `CLOUDFLARE_ACCOUNT_ID` is already set in the committed `.env`.
2. Run `bun run apply` to print a plan -- what would change, per app and per trigger -- without writing anything. Safe to run any time.
3. Run `bun run apply:run` to actually apply those changes.

`config.ts` is the durable, versioned desired state -- change a build/deploy command or a managed Build Variable by editing it and re-running `bun run apply:run`, not by hand-editing anything in the Cloudflare dashboard. Watch paths aren't hand-maintained at all: `apply.ts` derives them from each app's own `package.json` workspace dependencies, so a newly added dependency is picked up automatically on the next run.

Both triggers get the same derived watch paths. Cloudflare's default for the non-production trigger is `*`, which fires a full preview build+deploy of *every* app on *every* push to *every* branch regardless of which app changed -- the symptom tracked in [issue #74](https://github.com/CanIL-CA/tabitha/issues/74). Cloudflare was long believed not to enforce `path_includes` on non-production triggers at all; a direct test on 2026-09-03 showed it does, so this tool scopes them. The practical consequence: a PR touching only files outside every app's watch paths (root docs, `.github/`, this tool itself) now gets **no** preview builds at all, which is intended, not a broken pipeline.
