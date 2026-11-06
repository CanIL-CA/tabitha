# TaBiThA Alerts (`@tabitha/alerts`)

Reconciles the TaBiThA Cloudflare account's notification policies against `config.ts`. Today that's one policy: an email whenever [Workers Issues](https://developers.cloudflare.com/workers/observability/issues/) detects a new or recurring failure on any of the Workers -- an uncaught exception, a failed invocation (a cron run included), a `5xx` response, or a `console.error`.

Issues only sees a Worker whose `wrangler.jsonc` sets `observability.issues.enabled: true`. Every app sets it; a new app needs it too, or the next deploy turns Issues off for that Worker.

The policy's type, `workers_observability_real_time_issue`, isn't offered in the dashboard's notification picker, which is why it lives here rather than being made by hand.

This tool is deliberately narrow, like its `tools/dns` and `tools/workers` siblings: it only touches a live policy whose `name` matches one in `config.ts`. The account's other policies -- the default budget alert and anything made in the dashboard -- are never changed.

## Usage

1. Set `CLOUDFLARE_API_TOKEN` in `.env.local` -- an account token (Manage Account -> Account API tokens, not My Profile -> API Tokens) named `Notifications - tools/alerts apply`, with the single permission **Account > Notifications > Edit**. `CLOUDFLARE_ACCOUNT_ID` is already set in the committed `.env`.
2. Run `bun run apply` to print what would change, without writing anything.
3. Run `bun run apply:run` to apply it.

`config.ts` is the durable, versioned desired state -- change a recipient by editing it and re-running `bun run apply:run`, not in the dashboard.
