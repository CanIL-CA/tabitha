# TaBiThA R2 (`@tabitha/r2`)

Provisions and reconciles the Cloudflare R2 buckets TaBiThA's account holds: whether a declared bucket exists, and whether its public-access method (none, the shared `r2.dev` subdomain, or a dedicated custom domain) matches `config.ts`. `config.ts` also doubles as the answer to "why does this bucket exist, and why is its access set this way" -- previously only discoverable by asking whoever created it, or clicking through the dashboard's many bucket settings.

This tool is deliberately narrow, like its `tools/dns`/`tools/workers` siblings: it only ever creates a missing bucket or grants access a bucket doesn't have yet. It never disables an existing `r2.dev` toggle or removes an existing custom domain that isn't declared in `config.ts` -- if that ever needs to happen, do it by hand and update `config.ts` to match, the same way you'd resolve any other drift this tool reports but doesn't auto-fix.

## What's out of scope here

- **Object-level operations** (uploading/downloading/pruning the actual files inside a bucket) are not this tool's job. See `tools/databases/migrations/backup/index.ts` (writes `db-backups`, keeping every version, and the Ontology snapshots in `db-migration-data`), `tools/databases/migrations/r2_sync.ts` (syncs `db-migration-data`), and `scripts/dx/r2_load.ts` (seeds local R2 emulation for dev).
- **Worker bindings** (`r2_buckets` in an app's `wrangler.jsonc`) aren't created or edited here -- `config.ts`'s `bound_in` field is documentation only, cross-referencing which app's binding (if any) consumes a bucket at runtime. Add or change an actual binding by hand-editing that app's `wrangler.jsonc`.
- **Storage class, CORS rules, and lifecycle rules** aren't modeled in `config.ts` -- every bucket in this account is still on Cloudflare's defaults (Standard storage class, the default 7-day multipart-abort lifecycle rule, no CORS) as of this writing. Add a field here if a bucket ever needs one of these set deliberately, rather than building it out speculatively now.

## Usage

1. Set `CLOUDFLARE_API_TOKEN` in `.env.local` -- see the comment above it in the committed `.env` for the exact token name/permission. `CLOUDFLARE_ACCOUNT_ID` is already set in the committed `.env`.
2. Run `bun run apply` to print a plan -- which buckets would be created, and which access grants would change -- without writing anything. Safe to run any time.
3. Run `bun run apply:run` to actually apply those changes.

`config.ts` is the durable, versioned desired state -- declare a new bucket, or change one's access method, by editing it and re-running `bun run apply:run`, not by creating or reconfiguring anything in the Cloudflare dashboard by hand.

## Why this shells out to `wrangler` instead of calling the API directly

Unlike `tools/gateway` and `tools/dns`, which call Cloudflare's REST API directly because it returns clean JSON, R2's bucket-management commands (`wrangler r2 bucket list`, `dev-url get`, `domain list`) have no `--json` output -- only `wrangler r2 bucket info` does. So `apply.ts` shells out to `wrangler` and parses its plain-text output where it has to, the same approach `tools/databases/migrations/r2_sync.ts` already uses for R2 object operations. No unit tests here for the same reason `r2_sync.ts` has none: the logic worth testing is thin, and the rest is a real CLI's output shape, which a mock would just have to guess at.
