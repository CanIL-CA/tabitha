# 0017: Anonymous feature-usage events via Workers Analytics Engine

## Status

Proposed

## Context

We want to know which features people actually use — e.g. which of the 37 themes are popular (and which are never chosen), what kinds of searches people run in ontology, sources, and targets (and which come back empty), which copilot settings translators actually change, and how often the editor's checker and AI Assist succeed. Nothing measured this before: no app ran an analytics script, and the [privacy policy](../../apps/www/src/routes/privacy/+page.svelte) said so.

Two constraints shaped the choice:

- Much of this is invisible to request logs. The theme lives only in `localStorage` (`packages/ui/src/themes/`), so the browser has to report it, and search/check outcomes (result counts, checker status) only exist inside the handlers.
- Every app already runs on Cloudflare Workers ([0003](./0003-cloudflare-platform.md)), so a Cloudflare-native store adds no new processor to the privacy policy.

## Decision

Record a small set of explicitly-defined, anonymous events to the `tabitha_usage` [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) dataset through a `USAGE` binding, via the shared `@tabitha/usage` package (`packages/usage`), which owns the event types and column layout.

Only production records usage. Each app's `preview` environment deliberately omits the binding (bindings aren't inherited by wrangler environments), and local dev has no real dataset to write to, so recording is a no-op everywhere else. `www` is prerendered static content and records nothing.

Events carry no user ID, IP address, cookie, or session identifier. Editor text and copilot output are never recorded — only outcomes and counts.

| Event | App | Where it's recorded |
| --- | --- | --- |
| `search` | ontology | `apps/ontology/src/routes/+page.server.ts` — the `english` scope is recorded before it redirects to targets |
| `search` | targets | `apps/targets/src/routes/[project=valid_project]/search/+page.server.ts` — page searches only; the JSON twin (`+server.ts`) is API traffic and isn't recorded |
| `search` | sources | `apps/sources/src/routes/search/+page.server.ts` — a reference lookup or a Phase 1 text search |
| `copilot_run` | copilot | `apps/copilot/src/routes/[book]/[chapter]/[verse]/+server.ts` (`verse`) and `[book]/[chapter]/+server.ts` (`batch`), once the stream finishes |
| `check` | editor | `apps/editor/src/routes/check/+server.ts` |
| `ai_assist` | editor | `apps/editor/src/routes/ai-assist/generate/+server.ts` |
| `ai_call` | copilot, editor | One per successful Gemini call, from the `on_usage` callback each app passes to `create_ai_client` (`apps/copilot/src/hooks.server.ts`, `apps/editor/src/lib/server/ai_assist/client.ts`). Token counts and timing only, never prompt or response text |
| `theme` | all five | Each root layout calls `report_active_theme` (`@tabitha/usage/client`), which POSTs that app's `/usage/theme` once per browser session via `navigator.sendBeacon`; `handle_theme_report` only accepts names from the shared `themes` list |

Some endpoints are also called by other apps (e.g. sources' edit page calls the editor's `/check`), so API events record a `caller` from `get_request_caller`:

- `same-origin` — the app's own pages (`Sec-Fetch-Site: same-origin`)
- a hostname such as `sources.tabitha.bible` — another app's pages, from the `Origin` header
- `no-origin` — server-to-server calls (another Worker via `@tabitha/api-client`, or a script)

### Column layout

Analytics Engine columns are positional (`blob1`…`blob20`, `double1`…`double20`), so new fields are appended — never reordered. Every event starts with `blob1` = app and `blob2` = kind; `index1` is the kind (Analytics Engine's sampling key). Free text (queries, error messages) is trimmed and capped at 100 characters; queries are also lowercased.

| Column | `search` | `theme` | `copilot_run` | `check` | `ai_assist` | `ai_call` |
| --- | --- | --- | --- | --- | --- | --- |
| `blob3` | scope | theme name | caller | caller | status (`ok`/`error`) | feature |
| `blob4` | filter | — | run (`verse`/`batch`) | status (`ok`/`warning`/`error`) | checker status of the output | gateway cache status (`HIT`/`MISS`, empty when absent) |
| `blob5` | query | — | book | — | error message | thinking level (`default` when unset) |
| `blob6` | note | — | mode (`brief`/`discern`) | — | — | — |
| `blob7` | referred by | — | LWC | — | — | — |
| `blob8` | — | — | MTT level | — | — | — |
| `blob9` | — | — | customized language-profile fields, comma-separated | — | — | — |
| `blob10` | — | — | error message (single verse only) | — | — | — |
| `double1` | result count (absent when the search hands off) | — | verses requested | errors | notes returned | prompt tokens |
| `double2` | — | — | verses that errored | warnings | — | output tokens |
| `double3` | — | — | sensitivity | tokens | — | thought tokens |
| `double4` | — | — | — | — | — | cached prompt tokens |
| `double5` | — | — | — | — | — | duration (ms) |

Search fields per app:

| App | scope | filter | note | referred by |
| --- | --- | --- | --- | --- |
| ontology | `stems`, `english`, `semantic`, … | category | — | — |
| targets | `target`, `reference` | project (`English`, `Swahili`, …) | `unsupported_project`, `unavailable`, or `incomplete` (reference mode) | `ontology` when arriving from ontology's English search |
| sources | `reference`, `text` | — | `invalid_reference` | — |

## Querying

Use the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) with an API token that has **Account Analytics: Read**. Analytics Engine may sample at high volume, so count with `SUM(_sample_interval)`, not `COUNT()`:

```sh
curl "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/analytics_engine/sql" \
	--header "Authorization: Bearer $CLOUDFLARE_ANALYTICS_TOKEN" \
	--data "SELECT blob3 AS theme, SUM(_sample_interval) AS sessions FROM tabitha_usage WHERE blob2 = 'theme' GROUP BY theme ORDER BY sessions DESC"
```

Themes never chosen are the ones missing from that result, compared against `packages/ui/src/themes/themes.ts`.

Search mix per app over the last 30 days:

```sql
SELECT blob1 AS app, blob3 AS scope, blob4 AS filter, SUM(_sample_interval) AS searches
FROM tabitha_usage
WHERE blob2 = 'search' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY app, scope, filter
ORDER BY searches DESC
```

Most common searches that found nothing, per app (excluding searches that hand off elsewhere, which have no count):

```sql
SELECT blob1 AS app, blob5 AS query, SUM(_sample_interval) AS searches
FROM tabitha_usage
WHERE blob2 = 'search' AND double1 = 0 AND NOT (blob1 = 'ontology' AND blob3 = 'english')
GROUP BY app, query
ORDER BY searches DESC
LIMIT 50
```

Which copilot language-profile options translators ever change:

```sql
SELECT blob9 AS customized, SUM(_sample_interval) AS runs
FROM tabitha_usage
WHERE blob2 = 'copilot_run'
GROUP BY customized
ORDER BY runs DESC
```

How often AI Assist output passes the checker, by outcome:

```sql
SELECT blob3 AS status, blob4 AS check_status, SUM(_sample_interval) AS requests
FROM tabitha_usage
WHERE blob1 = 'editor' AND blob2 = 'ai_assist'
GROUP BY status, check_status
```

Tokens and cache behavior per app and feature. Billed output is `double2 + double3`; `double4` is the part of the prompt Vertex served from its own cache, and `blob4` is the AI Gateway's exact-match cache status:

```sql
SELECT blob1 AS app, blob3 AS feature, blob5 AS thinking_level, SUM(_sample_interval) AS calls,
	SUM(_sample_interval * double1) AS prompt_tokens, SUM(_sample_interval * double2) AS output_tokens,
	SUM(_sample_interval * double3) AS thought_tokens, SUM(_sample_interval * double4) AS cached_tokens
FROM tabitha_usage
WHERE blob2 = 'ai_call'
GROUP BY app, feature, thinking_level
```

Editor checks from the editor's own UI vs. other apps:

```sql
SELECT blob3 AS caller, blob4 AS status, SUM(_sample_interval) AS checks
FROM tabitha_usage
WHERE blob1 = 'editor' AND blob2 = 'check'
GROUP BY caller, status
```

## Alternatives considered

- **Cloudflare Web Analytics** (the free, cookieless JS beacon). Good for page views, referrers, and countries, but it has no custom events, so it can't answer "which theme" or "which search scope". Could be added alongside later for traffic-level numbers.
- **A third-party product analytics tool** (Plausible, PostHog, Umami). Richer dashboards, but it adds an outside processor to the privacy policy and a script to every page, for questions a handful of SQL queries answer.
- **Writing events to D1.** Works, but D1 is our content store; high-volume, append-only telemetry would add write load to it and needs its own retention cleanup, which Analytics Engine handles itself.

## Consequences

- The privacy policy now describes these events. Any new event kind needs a matching update there and in `packages/usage/src/events.ts`.
- Search counts can include SvelteKit hover-preloads (`data-sveltekit-preload-data="hover"`) of a link to a search, since the server can't tell a preload from a navigation. Today the only such links are on two signed-in ontology editing pages, so the effect is negligible. Revisit if public pages start linking to searches.
- A copilot batch "retry" re-runs a single verse through the verse endpoint, so it's counted as a `verse` run.
- A theme change mid-session shows up in the next session's report, not immediately; theme counts are per app, per browser session.
- Analytics Engine keeps data for a limited window (currently three months), so export anything that needs a longer history.
