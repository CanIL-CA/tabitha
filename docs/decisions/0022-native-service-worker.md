# 0022: A native SvelteKit service worker, shared through `@tabitha/service-worker`

## Status

Accepted. Supersedes [0001](./0001-service-worker-strategy.md).

## Context

ADR 0001 adopted `vite-plugin-pwa` through its SvelteKit wrapper, `@vite-pwa/sveltekit`, mainly for Workbox's expiration helpers and for `workbox-background-sync`, which was meant to carry offline edits.

By the SvelteKit 3 upgrade, the wrapper was the one dependency blocking it: its latest release (1.1.0) only supports SvelteKit 1 and 2, and against SvelteKit 3 it builds but emits no service worker. Upstream support (vite-pwa/sveltekit#111) was closed unmerged, with a different approach planned and no timeline.

Looking at what the plugin actually did for us:

- **Precaching** the build output and static files. SvelteKit's build files already have content-hashed names, so Workbox's per-file revisioning adds little over one cache per deployment.
- **One network-first GET rule per app**: editor's `/check`, sources' `/analyze`, and ontology's `/examples` (a strict allowlist), each capped at 200 entries and 24 hours. Targets has none, since its Explorer loads data server-side.
- **Taking over on install** (`registerType: 'autoUpdate'`), with update detection left to SvelteKit's `version` polling and `UpdateNotice` in `@tabitha/ui`.
- **Generating the web app manifest.** It was never linked from any page, though: the plugin needed a `pwaInfo` link tag that was never added, so none of the apps was installable, despite ADR 0001 recording installability as resolved.

Background sync was never used. Ontology's offline queue is its own IndexedDB code (`apps/ontology/src/lib/offline/`).

## Decision

Drop `@vite-pwa/sveltekit`, `vite-plugin-pwa` and `workbox-window`, and use SvelteKit's native service worker with no Workbox modules either:

- **`@tabitha/service-worker`** holds the whole worker: `register_service_worker({ self, version, precache_files, network_first_paths })`. Its decisions are pure functions in `strategy.ts`, unit-tested in Node.
- **Each app's `src/service-worker/index.ts`** calls it with `$app/manifest`'s `immutable` and `assets`, `$app/env`'s `version`, and its own allowlist of network-first paths. SvelteKit registers it.
- **The manifest** is a static `static/manifest.webmanifest`, linked from `app.html`.

The silent upgrade from ADR 0001 behaves the same, and the worker guards the three things it depends on:

1. **Never answering `/_app/version.json` from a cache.** If it did, `updated` would never flip and new deployments would go unnoticed.
2. **Never handling page loads (`mode: 'navigate'`).** A full page load always gets the newest HTML, and it's what `UpdateNotice` relies on to move a tab to a new version.
3. **Caches named by SvelteKit's `version`.** On activate, the worker deletes every other cache, including the ones the Workbox worker left on users' machines, then takes over (`skipWaiting` and `clients.claim`).

SvelteKit serves the worker at `/service-worker.js` rather than the plugin's `/sw.js`. Both use scope `/`, so the first full page load after this deploys registers the new worker in place of the old one.

## Alternatives considered

**Wait for an official `@vite-pwa/sveltekit` release.** It kept the SvelteKit 3 upgrade blocked indefinitely on a dependency doing little for us.

**Adopt the community fork `@katama-labs/vite-pwa-sveltekit`.** It's a third-party build of something that controls every request the apps make, adopted to keep a dependency we barely used.

**A native worker importing Workbox's modules** (`workbox-routing`, `workbox-strategies`, `workbox-expiration`). These are framework-agnostic, so they wouldn't have blocked SvelteKit upgrades. Not chosen: the strategy and expiry logic is about 30 lines of tested code, so four dependencies weren't worth it.

## Consequences

- No PWA plugin sits between the apps and SvelteKit upgrades.
- The caching behavior is ours to maintain. Anything beyond network-first and precaching, such as stale-while-revalidate or background sync, has to be written and tested in `@tabitha/service-worker`.
- Runtime caches are now per deployment. A cached API response no longer survives a deploy, while under Workbox it lasted its 24 hours regardless.
- The apps are installable for the first time.
- `context.setOffline()` stalled page reactivity in Playwright with the plugin's worker. It doesn't with this one (checked in a production build), so the ontology e2e specs' per-request offline simulation is a choice, not a workaround.
