# 0019: UI internationalization uses Paraglide JS, with the locale taken from the browser

## Status

Accepted (2026-09-28)

## Context

Copilot needs its UI in Indonesian as well as English, and the other apps are expected to follow. The request covers UI text only: AI-generated output already has its own language setting (the LWC), which stays separate.

Paraglide JS (inlang) is SvelteKit's official i18n integration, installed by `sv add paraglide`. It compiles message catalogs into typed, tree-shakable functions (`m.get_notes({ mode })`), so a missing or misspelled key is a type error, and each page ships only the messages it uses. That's a good fit for Worker bundle size.

Because more apps are expected to adopt this, the shared setup is built now rather than waiting for a third consumer (the usual Rule of Three, AGENTS.md §12). The per-app cost of opting in should be a few small files.

## Decision

- **Paraglide JS 2**, with each app owning a `project.inlang/` and a `messages/{locale}.json` catalog. Locales are `en` (base) and `id`.
- **The locale comes from the browser**, via Paraglide's `['preferredLanguage', 'baseLocale']` strategy: `Accept-Language` during SSR, `navigator.languages` on the client, with a base-language fallback (so `id-ID` gets `id`). URLs aren't prefixed, and there's no cookie or language switcher.
- **Shared compiler options** (`PARAGLIDE_OPTIONS` in `packages/vite-config/paraglide.js`) feed both the Vite plugin, enabled by `create_app_vite_config({ i18n: true })`, and the `tabitha-compile-messages` bin, which an app's `check` script runs so svelte-check sees the generated `$lib/paraglide`. It stays out of `prepare` because `bun install` runs that script and can start it before Paraglide's dependencies finish linking. Both therefore always produce the same runtime. Paraglide's own `project.inlang/paraglide.config.js` file isn't used. The shared options pin `outputStructure: 'message-modules'`, because Paraglide 3's Vite plugin defaults to virtual modules while `compile()` writes physical files. Paraglide 3 writes `project.inlang/cache/`, which the root `.gitignore` excludes.
- **`@tabitha/ui`'s own strings** (`ui_*` keys) live in `packages/ui/messages/`. Each app's inlang settings list that catalog first in `pathPattern`, so it's merged into the app's compiled messages. The root layout passes the app's `m` to `set_ui_messages(m)`, which puts it in a Svelte context that UI components read. An app that hasn't enabled i18n sets nothing and gets English, so `@tabitha/ui` needs no Paraglide runtime of its own.

## Alternatives considered

- **A runtime library (`svelte-i18n`, `sveltekit-i18n`, i18next).** Rejected: these ship every catalog to the client and look keys up by string, with no compile-time check. None of them is the framework-endorsed option.
- **Localized URLs (`/id/...`) or a cookie with a switcher.** Deferred. Copilot is a tool rather than a public site, so there's no search indexing to gain, and localized URLs would add a `reroute` hook and link localization everywhere. If users need to override their browser's language, adding `cookie` to the strategy plus a small toggle is additive.
- **A separate Paraglide project and runtime inside `@tabitha/ui`.** Rejected. Two runtimes would each need their locale set per request, and the package would need its own compile step in every consumer's build. Merging the catalog into each app's compile avoids both.
- **Passing translated labels to UI components as props.** Rejected: labels would have to thread through `Footer` into `UpdateToast`, and every app would repeat the wiring.

## Consequences

- **Adopting i18n in another app** takes a `project.inlang/settings.json`, a `messages/` folder, `i18n: true`, the `check` compile, a `handle` in `hooks.server.ts`, `lang="%paraglide.lang%"` in `app.html`, and `set_ui_messages(m)`. CONTRIBUTING.md has the checklist.
- **Generated output is excluded by name.** `src/lib/paraglide/` is gitignored, which also covers ESLint. The storage and philosophies audits skip `paraglide` directories, and markdownlint skips both that folder and `*.inlang/`.
- **Compiling loads the inlang message-format plugin from jsDelivr** (pinned to major version 4), so `check`, `build`, and `dev` need network access the first time. Workers Builds and CI both have it.
- **The locale list is repeated in each app's `settings.json`.** Inlang settings can't extend a shared file, and the lists are short.
- **A new `@tabitha/ui` string** goes into both `packages/ui/messages/*.json`. It's then type-checked everywhere an app calls `set_ui_messages(m)`.
- **The Indonesian text is a first draft by Claude** and hasn't been reviewed by a native speaker.
