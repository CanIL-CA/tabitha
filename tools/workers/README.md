# TaBiThA Workers (`@tabitha/workers`)

Reconciles each TaBiThA app's Cloudflare **Workers Builds** production settings -- build command, deploy command, watch paths, build cache, and Build Variables -- against `config.ts`, connects a Worker that isn't connected to the repo yet, and reports any Worker whose Workers Builds preview builds are switched on. Settings edited in the dashboard drift silently, and an older Workers Builds model hid a second trigger the dashboard couldn't reach at all; full writeup in the `cloudflare-workers` skill's "Workers Builds Git Integration" section.

Every Worker is on Workers Builds' Worker Previews model with preview builds turned off: Workers Builds only deploys production from `main`, and CI builds each PR's Worker Previews ([ADR 0020](../../docs/decisions/0020-per-pr-worker-previews.md)). This tool reads and writes that model's settings through `GET`/`PATCH /accounts/{account_id}/builds/workers/{tag}` (`production_settings`) and connects new Workers with `POST /accounts/{account_id}/builds/workers`. Those endpoints aren't in Cloudflare's public API reference yet. Their shapes come from the generated SDK in Cloudflare's `cf` CLI (`cloudflare/cf`, `packages/cli/src/sdk/sdk/api/types/Builds*`).

This tool is deliberately narrow. It only manages the fields listed above. It never touches the watched branch, `path_excludes`, `root_directory` (except when connecting a new Worker), the Previews settings, or any Build Variable it doesn't itself declare in `managed_environment_variables` -- anything else already set, by hand or otherwise, is left alone. It reports preview builds being on without changing them.

## Adding a new app's Worker

The Workers Builds API connects an *existing* Worker, so the Worker has to exist first:

1. Create an empty Worker named after the app's `wrangler.jsonc` `name` (Workers & Pages -> Create application -> Start with Hello World). Don't create it with a local `wrangler deploy`: a local build bakes your `.env.local` into the production bundle (see the `cloudflare-workers` skill).
2. Add the app to `desired_apps` in `config.ts`, then run `bun run apply` (it should say "would connect") and `bun run apply:run`. That connects the Worker to the repo with production builds from `main`, preview builds off, and the git repository and build token copied from an already-connected Worker.
3. Trigger the first real build with a push to `main` that touches the app's watch paths (or an empty commit). It replaces the Hello World code and attaches the custom domains from `wrangler.jsonc`.

## What's out of scope here

- **Compatibility flags and placement mode** (Smart Placement) are controlled by each app's `wrangler.jsonc` instead, applied authoritatively on every `wrangler deploy`/`wrangler preview` -- not part of the Workers Builds API this tool talks to, and not drift-prone the way build settings are. Fix those by editing `wrangler.jsonc`, not here.
- **Creating the Worker itself** -- see step 1 above.

## Usage

1. Set `CLOUDFLARE_API_TOKEN` in `.env.local` -- see the comment above it in the committed `.env` for the exact token name and permissions. Unlike `tools/dns`/`tools/gateway`'s tokens, this one has to be a **User** API Token (My Profile -> API Tokens): the Workers Builds API doesn't yet support Account-Owned tokens at all, and rejects them with a generic `401 Invalid token` regardless of permissions. `CLOUDFLARE_ACCOUNT_ID` is already set in the committed `.env`.
2. Run `bun run apply` to print a plan -- what would change, per app, plus any ⚠️ problem to fix by hand -- without writing anything. Safe to run any time.
3. Run `bun run apply:run` to actually apply those changes.

`config.ts` is the durable, versioned desired state -- change a build/deploy command or a managed Build Variable by editing it and re-running `bun run apply:run`, not by hand-editing anything in the Cloudflare dashboard. Watch paths aren't hand-maintained at all: `apply.ts` derives them from each app's own `package.json` workspace dependencies, so a newly added dependency is picked up automatically on the next run. Worker tags (the IDs the Workers Builds API is keyed by) aren't kept in `config.ts` either; `apply.ts` looks them up by Worker name.
