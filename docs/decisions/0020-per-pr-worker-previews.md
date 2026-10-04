# 0020: Per-PR Worker Previews that call production siblings

## Status

Accepted. Supersedes [0015](./0015-cross-app-preview-custom-domains.md).

## Context

ADR 0015 gave each app one shared preview Worker (`<app>-preview`, at `<app>-preview.tabitha.bible`), deployed by CI on every PR so that one app's preview could call another app's preview. It accepted a known cost: concurrent PRs touching the same app overwrite each other's preview, last push wins, and that covers code *and* `wrangler.jsonc` vars.

That cost turned out to be routine, not rare:

- 2026-09-28: PR #160 (touching shared packages) redeployed `ontology-preview` with the old `GOOGLE_OAUTH_CLIENT_ID` and broke PR #159's sign-in on preview, which first looked like a wrong secret.
- 2026-10-03: PR #171 replaced PR #167's `editor` preview while it was under review. The reviewer asked for branch-specific previews back, noting it "has already caused an issue a couple times."

It's common to work on one app, and common for several PRs to touch the same app, often just through `packages/`.

Cloudflare launched [Worker Previews](https://developers.cloudflare.com/workers/previews/) on 2026-09-22: named Previews that live inside a Worker, each with its own code, settings and URL, deployed with `wrangler preview --name <name>`. Two spikes on `sources` (2026-10-03) found:

- ✅ Previews work with our D1 and rate-limit bindings, and can be served on a custom domain: turning on `previews_enabled` for a Worker's custom domain serves Preview `X` at `X.<domain>`. Cloudflare provisions the wildcard DNS record and certificate itself. Turning it on for the *production* domain (`sources.tabitha.bible`) left production serving normally.
- ❌ A Worker can't `fetch()` a Preview's custom-domain URL: it gets an undocumented HTTP 400 `error code: 1053`, whether the caller is production or another Preview ([cloudflare/workers-sdk#16052](https://github.com/cloudflare/workers-sdk/issues/16052)). Browsers and curl reach the same URL fine. So server-side preview-to-preview calls, ADR 0015's core requirement, don't work on Previews today.

## Decision

**Each PR gets its own Worker Preview per changed app, on that app's production Worker, and Previews call production sibling apps.**

- CI's `preview_deploy` job builds the changed apps (`build:preview`) and runs `wrangler preview --name pr-<N>` in each. The Preview is served at `pr-<N>.<app>.tabitha.bible`. `www`'s production domain is the apex, so its Previews use a preview-only custom domain, `www-pr.tabitha.bible`, instead of putting a `*.tabitha.bible` wildcard on the apex. (`www.tabitha.bible` already has a DNS record that redirects to the apex.)
- Each app's `wrangler.jsonc` replaces `env.preview` with a `previews` block. A Preview inherits nothing from the top level, so the block redeclares every var and binding. Read-only bindings point at production's resources, as `env.preview` did: `sources`' and `targets`' databases, `DB_Auth` (only read, for permission checks), the rate limiters and the Vectorize index.
- **`DB_Ontology` is the exception: Previews get their own copy.** Ontology's suggest and approve flows write to it (`Changes`, and `Concepts`, including renumbering IDs), and under ADR 0015 a reviewer testing them wrote to production. When `tools/databases` deploys a new Ontology database, it loads the same dump a second time into `<name>_preview_<date>` (e.g. `Ontology_9494_preview_2026-09-29`) and points the `previews` block there. All open PRs share that copy, so their test data can mix, but nothing written in a Preview reaches production or the database that ships with a data-update PR. The copy starts from the snapshot, so it doesn't have changes made in production since the cutover. Cleanup treats `..._preview_<date>` as its own dated family, with the usual retention. The nightly backup that feeds ontology's `/downloads` page used to export "the newest D1 whose name starts with `Ontology`", which would have published the copy. It now exports the database production binds (`DB_Ontology` at the top level of `apps/ontology/wrangler.jsonc` on `main`). That also stops it from exporting a data-update PR's new database before the PR merges. Secrets live in each Worker's Previews Base config (`wrangler preview base-config secret put`). New Previews copy them when they're created; changing a Base secret doesn't reach existing Previews.
- Previews call **production** sibling apps. The `.env.preview` files that pointed builds at sibling `-preview` hosts are gone. A PR that changes an app-to-app contract is tested locally, where every app runs together. Nothing flags such PRs automatically yet. CI's change scoping (ADR 0008) could, if that turns out to be worth building.
- The shared stack is retired: the six `<app>-preview` Workers, their custom domains and their secrets get deleted once per-PR Previews work. That leaves 7 Workers in total, one per app.
- A new `preview_cleanup.yml` workflow deletes a PR's Previews when the PR closes. Cloudflare also evicts the oldest Preview past 500 per Worker.
- Every Worker moves to Workers Builds' Worker Previews model with **preview builds turned off**. Workers Builds keeps deploying production from `main` and nothing else, and CI owns PR previews. The switch removes the old "Deploy non-production branches" trigger (`wrangler versions upload`) and can't be undone. `tools/workers` now reconciles the single production trigger and reports any Worker whose preview builds are on.
- Ontology's Google sign-in goes through production. Google rejects wildcard redirect URIs, so a `pr-<N>` host can't be registered. Auth.js's redirect proxy (`OAUTH_REDIRECT_PROXY_URL=https://ontology.tabitha.bible/auth`, removed in PR #159) is back: a Preview sends production's callback URL to Google, and production forwards the user back. Previews get the URL as a runtime var in `previews.vars`, because CI builds them after `setup:env` has written a `.env.local` that blanks the build-time value for local dev. For that to work, ontology's Previews use the production Google client ID (in `previews.vars`) and production's `AUTH_SECRET` and `GOOGLE_OAUTH_CLIENT_SECRET` (in its Previews Base secrets).

## Alternatives considered

**Keep the shared stack, and post a "your preview was replaced" PR comment.** Makes the clobbering visible but doesn't stop it, and reviews still stall.

**Per-PR Previews by default, plus the shared stack for PRs that change a cross-app contract** (opt-in by label, or detected automatically). Keeps server-side preview-to-preview testing, but means two build modes, two env setups and six extra Workers kept alive for a minority of PRs. The reviewer was fine relying on local testing for those PRs.

**Previews hosted on the existing `<app>-preview` Workers instead of the production ones.** Avoids the one-way Workers Builds switch on production Workers, but keeps 13 Workers where 7 do the job. Under this design the switch costs nothing: production deploys are unchanged, and the old model's per-branch `versions upload` builds were already unused.

**A preview-specific OAuth client, or proxying sign-in through a kept-alive `ontology-preview` Worker**, so Previews never hold production's secrets. Not chosen. Proxying through production needs no extra Worker and no Google console changes, and production's secrets were judged acceptable on Previews, whose code comes from team members' PRs.

**Wait for workers-sdk#16052.** If Cloudflare fixes the `1053` error, Previews could call each other's Previews again. That would bring back ADR 0015's cross-app preview testing without the shared slot. Revisit then.

## Consequences

- ✅ Concurrent PRs no longer overwrite each other's previews, and each Preview keeps the vars from its own branch.
- ⚠️ A preview can't show a change that spans two apps' server-side contract. Those PRs need a local run, and nothing in CI flags them yet.
- ⚠️ Ontology Previews hold production's `AUTH_SECRET` and Google client secret, so code in an open PR can sign sessions that production would accept.
- ⚠️ Previews are public by default. The same was true of the shared stack; Cloudflare Access can protect them if that becomes a concern.
- A Previews Base secret change doesn't reach existing Previews. After rotating one, re-set it on each open PR's Previews (`wrangler preview secret put --name pr-<N>`).
- The `previews` block has to be kept in step with each app's top-level bindings by hand. `tools/databases`' repointer updates both: production entries get the new database, and the `previews` entry gets the new database or, for `DB_Ontology`, its preview copy.
- Each Ontology data deploy loads the 80 MB dump twice.
- Worker Previews and `wrangler preview` are in open beta.
