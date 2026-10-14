# 0023: Server-side cross-app calls go through service bindings

## Status

Accepted. Amends [0020](./0020-per-pr-worker-previews.md) and replaces [0015](./0015-cross-app-preview-custom-domains.md)'s choice of public HTTPS for server-side calls between apps.

## Context

Every app rate limits by client IP: 60 requests per 60 seconds, keyed on `getClientAddress()`, which reads `cf-connecting-ip`. When an app's Worker calls a sibling's public host (`targets.tabitha.bible`), the request goes out through Cloudflare's edge. On 2026-10-14, zone analytics for `targets.tabitha.bible` over three days showed about 28,000 requests from users in Canada, the US and the Philippines, all with client IP `2a06:98c0:3600::103`. That's the address Cloudflare documents for Worker subrequests between zones. Browser IPs made up only a few hundred requests. So every user of `editor` (and `copilot`, `sources` and `ontology`) shared one 60-request-per-minute limit on each sibling. The editor's Worker logged 68 `[api-client] 429` warnings in the week before #195, when a long passage made about 250 lookups per check.

PR #195 batched the editor's lookups (about 2 requests per check), which hides the problem for now. The shared limit still caps all users together, at about 15 editor checks a minute.

ADR 0015 rejected service bindings, but for reasons that were specific to previews:

1. Workers Builds' `WRANGLER_CI_OVERRIDE_NAME` would have deployed `env.preview` into the production Worker. ADR 0020 removed `env.preview`, and Workers Builds now deploys only production from `main`.
2. Bindings aren't inherited by an environment. The `previews` block already redeclares every binding.
3. Previews would have tested a different transport from production. Now production and Previews both use the binding.

Cloudflare's docs say a service binding from a Worker Preview calls the bound Worker's production deployment. That's what ADR 0020 already chose: Previews call production siblings.

A local experiment (two Workers under `wrangler dev` 4.149, plus `getPlatformProxy`) found:

- A request through a binding arrives with no `cf-connecting-ip`, no `x-real-ip` and no `request.cf`.
- A `cf-connecting-ip` the caller sets passes through unchanged.
- `ctx.props` from the binding's config reaches the callee, but `@sveltejs/adapter-cloudflare` 8 doesn't pass `ctx` to SvelteKit.
- Under `getPlatformProxy`, a binding whose target isn't running still exists, but every call returns `503 Worker "…" not found`. Our apps run under `vite dev` locally, which a binding can't reach.

## Decision

**An app's server-side calls to a sibling app go through a service binding. Browser calls keep using the public host.**

- `editor`, `copilot`, `ontology` and `sources` each declare a `services` binding (`ONTOLOGY`, `SOURCES`, `TARGETS`) for each sibling they call, at the top level and in `previews`.
- Each of those apps calls `use_service_bindings` from `@tabitha/api-client` once, in `hooks.server.ts`. It pairs each sibling's `PUBLIC_*_API_HOST` with its binding. Any client whose `base_url` has that origin then calls through the binding. Client modules don't change, including ones the browser also loads, because the browser never runs `hooks.server.ts`.
- The binding's wrapper sets `Host` from the URL, as a public request would carry it. A bound request otherwise has no headers but the ones the caller sets. Without `Host`, ontology's Better Auth can't resolve its base URL and every bound call to ontology returned 500. A local run of the built apps under `wrangler dev` caught this.
- `@tabitha/rate-limit` doesn't limit a request without a client address. Cloudflare's edge sets `cf-connecting-ip` on every public request, so only a binding call arrives without one, and the calling app has already rate limited its own user.
- Locally, `PUBLIC_SERVICE_BINDINGS_DISABLED=true` (written by `setup:env`, like `PUBLIC_RATE_LIMIT_DISABLED`) keeps calls on HTTP to the siblings' local ports. Each app passes it in explicitly, per [0010](./0010-shared-handle-env-toggles-stay-explicit.md).
- CI's `preview_deploy` job deletes `apps/*/.env.local` before building Previews. `setup:env` had been baking local values into Previews, so on 2026-10-14 the editor's #195 Preview called `http://localhost:1382`. That would also have turned bindings off in Previews.

## Alternatives considered

**A shared secret header that bypasses the limit.** Simpler to wire, and local dev would work the same way. But it means a secret in every caller and callee, in the Previews Base config too, and rotating it. Calls would still go out through the edge, and anyone who has the secret could turn the rate limit off.

**Higher limits on the batch routes.** Raises the shared ceiling without fixing the shared key.

**Forwarding the user's IP in `cf-connecting-ip`, so the sibling limits each user.** It works through a binding, but a module-level client needs the current request's IP, which means per-request plumbing (`getRequestEvent()`) through every call path. The calling app already limits each user, so the sibling's second limit adds little.

**A local-only wrangler environment without `services`**, so the binding is simply missing in dev. `getPlatformProxy` can't drop a binding, and a named environment doesn't inherit D1, rate-limit or Vectorize bindings, so each app's config would gain a third copy of them for `tools/databases` to keep in step.

**Remote bindings in dev (`remote: true`).** Local runs would call production siblings, which breaks the local cross-app testing ADR 0020 relies on.

## Consequences

- ✅ Each user's calls count only against the calling app's own per-user limit, not one limit shared with everyone.
- ✅ Calls skip the public edge. Cloudflare doesn't bill a binding call as a second request.
- ⚠️ A single request can make at most 32 Worker invocations through bindings. Per-word lookups like the editor's before #195 would fail outright, so cross-app calls need batch endpoints (see the `fix-at-the-owning-service` convention).
- ⚠️ A sibling no longer limits calls that arrive through a binding. If a calling app fans one user request out into many sibling calls, the caller's limit is the only guard.
- ⚠️ Local dev uses HTTP while production uses the binding, so a binding-only failure shows up first in a Preview. A Preview's binding reaches production siblings, so it can't show a change to a sibling's contract either. Those still need a local run (ADR 0020).
- Not yet confirmed in production: that the deployed runtime, like `wrangler dev`, adds no `cf-connecting-ip` to a binding call. The first Preview from this change should show it, through the sibling's own logs.
- ADR 0020's runtime `previews.vars` entry for `OAUTH_REDIRECT_PROXY_URL` was a workaround for `.env.local` being baked into Previews. It's removed: a Preview now takes the value from the committed `.env`, as production does.
