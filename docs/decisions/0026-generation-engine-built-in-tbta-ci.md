# 0026: The generation engine and its databases come from tbta's CI, pinned here

## Status

Accepted (2026-11-20).

## Context

The proof of concept (#248) ran TBTA's generation engine, compiled to WebAssembly, in a Cloudflare Worker (`apps/generator`) that sources calls through a service binding ([0023](./0023-cross-app-calls-via-service-bindings.md)). Everything it needed was made on a developer's machine: the engine was compiled with Emscripten from a local checkout of [CanIL-CA/tbta](https://github.com/CanIL-CA/tbta) (`tools/tbta-wasm`), the Ontology and English databases were prepared locally with `tbta_utils`, and the Worker was deployed by hand. Nobody else could reproduce a deploy, and the deploy pipeline couldn't build the app at all.

The engine's source lives in tbta, which is private and maintained separately. Its CI already builds TBTA for every platform and publishes binaries to the public [CanIL-CA/tbta-public](https://github.com/CanIL-CA/tbta-public) releases.

## Decision

**tbta's CI produces the engine and the databases. This repo downloads a pinned version of each at build time, checks them, and deploys the generator through Workers Builds like any other app.**

- **The engine** is built by tbta's `wasm-engine` workflow and attached to a tbta-public release as `TBTA-Worker-WASM.tar.gz`. tbta's Release workflow calls it for every release; it can also be dispatched for an existing tag. It generates a verse under Node before it attaches anything, and runs that check on tbta pull requests that touch the engine.
- **The databases** are prepared by tbta's `prepare-target-for-web` workflow, dispatched by hand: it upgrades a TBTA target export to an Ontology, trims it, and writes `<ontology-version>/Ontology.sqlite`, `<ontology-version>/<Language>_<export-date>.sqlite` and `manifest.json` to the `db-generation` R2 bucket ([tbta#52](https://github.com/CanIL-CA/tbta/pull/52)).
- **This repo pins all of it** in `apps/generator/scripts/engine_source.ts`: `TBTA_RELEASE`, `ONTOLOGY_VERSION` and `EXPORT_DATE` (the date of the English export). A new engine, Ontology or export reaches production only when a commit changes a pin and merges, so every change is reviewed and revertible.
- **Prepared databases are immutable.** The export's date, read from the target's file name, is part of the language database's key, so preparing a newer export adds a file and never changes what a pin names. The workflow refuses to write a file that exists unless it's run with `overwrite`. `Ontology.sqlite` is written once per version.
- **The build refuses a bad download.** `fetch_engine.ts` checks that neither database is in WAL mode, that the Ontology is the pinned version and English is mapped to it, and that the engine generates Genesis 1:1. A failure fails the build.
- **`db-generation` is its own bucket, public through its r2.dev address** and declared in `tools/r2/config.ts`. The generator's build is its only reader; browsers that run the engine get the files through sources (`/generator/<name>`), not from the bucket.
- **English only, one pair per deploy.** The Worker bundles the pinned Ontology and English databases. Other languages, and choosing the pair at run time, are left for later (`apps/generator/README.md`).

## Alternatives considered

- **Keep compiling the engine in this repo** (`tools/tbta-wasm`). CI here would need tbta's private source and an Emscripten toolchain, and engine builds would drift from what tbta tests and releases. Removed instead.
- **Commit the engine and databases to git.** Several MB of binaries per update, in a repo that already keeps its database snapshots in R2 rather than in git.
- **Always use tbta's latest release and the latest prepared Ontology.** No pin to bump, but an engine or Ontology change would reach production with no review and no record of what was live, and a rollback would need a tbta release.
- **Store the databases in `db-backups`.** Ontology's `/downloads` lists the whole bucket, TBTA's updater reads its first entry as the newest Ontology ([0025](./0025-ontology-d1-single-source-of-truth.md)), and the cleanup job keeps only the 2 latest Ontology versions.
- **A custom domain on `tabitha.bible` for `db-generation`.** Tried and removed on 2026-11-20: Bot Fight Mode on the zone answered GitHub's runners with a managed challenge (403). It runs outside the Ruleset Engine, so no custom rule can exempt a hostname from it ([Cloudflare docs](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/#limitations)); the options are turning it off for the whole zone or a paid plan's Super Bot Fight Mode. With the build as the only reader, the r2.dev address is enough: it's rate-limited, but a build downloads two files.
- **Download with `wrangler r2 object get` and a token.** Works with no public access, but every build environment (Actions, Workers Builds, local dev) would need an R2 token for data that isn't secret.

## Consequences

- **Two repos move together.** A new engine needs a tbta release (published, not draft: tbta's Release workflow creates drafts, and a draft's assets can't be downloaded anonymously), then a pin change here. A new Ontology or English export needs a prep run, then a pin change.
- **`src/engine.ts` and tbta's `GenerateVerseFromEncoding` export are a contract.** If tbta changes the exported signature, the build's Genesis 1:1 check fails until `engine.ts` matches.
- **Previews don't show generator changes.** A sources preview calls the production generator, and the generator has no previews of its own. A generator change is tested locally, or hand-deployed, which replaces production until the next pipeline deploy.
- **Sources rebuilds when the generator changes**, because it imports `AUDIENCES` and the engine loader from `@tabitha/generator`. `tools/workers` derives that watch path from sources' dependencies (#278).

## Open questions

- **Retention.** Files are never replaced, so the bucket only grows. The intent is to keep the pinned pair and the one before it, so a rollback can still download, and prune the rest. Nothing prunes yet.
- **Ontology updates.** Nothing prepares a new Ontology automatically; see [tbta#37](https://github.com/CanIL-CA/tbta/issues/37). Whether that should be automatic is not decided.
- **Target languages.** The direction, not a plan: generate a verse in a target language from its semantic encoding, using that language's lexicon and rules, as TBTA does natively. The engine already takes a `language` and opens `<Language>.sqlite`; English is just the first target language database, and `prepare-target-for-web` already takes a `language` and keeps a manifest keyed by language. Not decided: how to hold more than one pair (the Worker bundles one, and English alone peaks at 86 MB of the 128 MB limit, so a Worker per language or loading a pair on demand), how a request names its language, and keeping every language database mapped to the pinned Ontology version. Untested: whether the other languages' databases (Swahili, Indonesian, Tagalog) are complete enough to give good text, which depends on how much analysts have encoded. A feature in the targets app would also need a verse's encoding from sources, and the job-building code that now sits in sources (`verse_generation.ts`, the book number mapping) moved into a shared package.
