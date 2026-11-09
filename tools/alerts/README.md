# TaBiThA Alerts (`@tabitha/alerts`)

Reconciles the TaBiThA Cloudflare account's notification policies, and the Workers Issues automations that trigger them, against `config.ts`. Today that's an email whenever [Workers Issues](https://developers.cloudflare.com/workers/observability/issues/) detects a failure on any of the Workers -- an uncaught exception, a failed invocation (a cron run included), a `5xx` response, or a `console.error`.

Three pieces make that email happen, and all three are needed:

1. **Issues on each Worker.** Issues only sees a Worker whose `wrangler.jsonc` sets `observability.issues.enabled: true`. Every app sets it; a new app needs it too, or the next deploy turns Issues off for that Worker.
2. **A Real-Time Issue notification policy** (`workers_observability_real_time_issue`) with an email destination. The dashboard's notification picker doesn't offer this type, and its automation form offers no email destination, so the policy is created through the API. Once it exists, it does show up in the dashboard, which is where its recipients are managed (see below).
3. **Automations** that send issues to that policy. A policy sends nothing on its own. There's one account-wide automation, for a new issue (its first occurrence). There's deliberately none for an issue that comes back after a quiet day: vulnerability scanners hit every Worker daily, so it emailed again and again for noise. The automations can't filter by issue type, only by Worker.

This tool is deliberately narrow, like its `tools/dns` and `tools/workers` siblings: it only touches a live policy or automation whose `name` matches one in `config.ts`. The account's other policies -- the default budget alert and anything made in the dashboard -- and any other automations are never changed.

## Usage

1. Set `CLOUDFLARE_API_TOKEN` in `.env.local` -- an account token (Manage Account -> Account API tokens, not My Profile -> API Tokens) named `Notifications - tools/alerts apply`, with two permissions: **Account > Notifications > Edit** and **Account > Workers Observability > Edit** (marked "Legacy" in the dashboard, but still the permission the Issues API asks for). `CLOUDFLARE_ACCOUNT_ID` is already set in the committed `.env`.
2. Run `bun run apply` to print what would change, without writing anything.
3. Run `bun run apply:run` to apply it.

`config.ts` is the durable, versioned desired state for everything except recipients -- change a policy's type or an automation's trigger by editing it and re-running `bun run apply:run`, not in the dashboard.

## Recipients

Who gets the email is not in this repo, since the repo is public. `ALERT_EMAILS` in `.env.local` (comma-separated) is read only when `apply.ts` creates a policy that doesn't exist yet. After that, `apply.ts` never compares or changes recipients, and an update keeps whatever the live policy has.

To see or change them:

1. Cloudflare dashboard (TaBiThA account) -> **Observability -> Alerts -> Platform Notifications**.
2. Find the **Worker issues (tools/alerts)** row and click the envelope icon in its **Method** column. This opens **Set up destinations**.
3. Under **Notification email**, use **Add email recipient** to add an address, or the trash icon to remove one, then **Save**.

The default budget alert in the same list has its own recipients and isn't touched by this tool.

## Testing the email by hand

`POST /accounts/{account_id}/workers/observability/issues/{issue_id}/notification-runs` with `{ "policyId": "<policy id>" }` sends one existing issue to the policy right away, whatever the automations would do. List issue ids with `GET .../workers/observability/issues`.
