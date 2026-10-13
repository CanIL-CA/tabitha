# 0012: One D1 database per target-language project

## Status

Accepted

## Context

The Targets app (`apps/targets`) served every target-language project (English, Swahili, Indonesian, Tagalog, and any future project) from a single shared D1 database (`DB_Targets`), with every table (`Text`, `Lexicon`, `Form_Names`, `Source_Features`, `Lexical_Features`, `Ideal_Text`) discriminated by a `project` column. [Discussion #32](https://github.com/CanIL-CA/tabitha/discussions/32) proposed splitting this into one database per project instead, citing query efficiency, data sovereignty, and each project's freedom to evolve independently; this was tracked as [issue #48](https://github.com/CanIL-CA/tabitha/issues/48), which deferred writing an ADR until the open questions below were settled.

A natural question raised before settling on this design: why not just split into per-project *tables* within the same database, rather than fully separate databases? That's cheaper to build and would deliver the same query-filtering benefit a `project` index already provides for free (the shared schema had no such index -- every project-scoped query was a full table scan). But D1 inherits SQLite's model on two points a table split can't touch:

- **Write concurrency.** SQLite serializes writers at the whole-database-file level, not per-table. Two projects writing concurrently contend on the same lock regardless of which tables they touch -- only a separate database file removes that contention.
- **Access control.** D1 grants are per-database (Worker bindings, scoped API tokens); there is no per-table permission. If a project's data must be genuinely inaccessible to code that doesn't own it, only a separate database enforces that boundary.

Table-splitting also doesn't buy independent read-replica placement (D1's locality benefit, the reason [0002](./0002-sqlite-d1-datastore.md) chose D1) or independent operational blast radius (D1's per-database size ceiling, migrations, backups) -- both are per-database-file properties either way. Given this project's translator base is real and globally distributed, and given the concrete plan below to actually use per-database credential scoping, these are the properties that matter -- so full database separation, not table separation, is the right shape.

## Decision

Split the Targets database into one D1 database per target-language project, named `Targets_<project>` and bound as `DB_Targets_<project>` (e.g. `DB_Targets_Swahili`), one binding per entry in `apps/targets/wrangler.jsonc`.

- **Project registry.** `TARGET_PROJECTS` in `packages/types/src/target.ts` is the single source of truth for which projects exist, currently `['English', 'Swahili', 'Indonesian', 'Tagalog']`. It drives route validation (`apps/targets/src/params/valid_project.ts`, tightened from a bare alphabetic-shape regex to real registry membership), binding resolution, the migration pipeline's per-project task list, and the `Platform.env` type (`apps/targets/src/app.d.ts`, a mapped type keyed off the registry so a new project's binding type is generated automatically). Adding a project starts here.
- **Binding resolution.** `apps/targets/src/hooks.server.ts` resolves `event.platform.env[`DB_Targets_${project}`]` from the request's `project` route param, rather than a single fixed `DB_Targets` local. This is new to the repo -- the one existing multi-binding precedent (`apps/ontology`, which binds `DB_Ontology` + `DB_Auth`) resolves two *fixed* names, not a binding selected by a runtime value.
- **The one cross-project query.** `GET /` (`apps/targets/src/routes/+server.ts`) previously ran `SELECT DISTINCT project FROM Lexicon` with no `WHERE` clause -- the only query in the app not scoped to a single project. It now returns `TARGET_PROJECTS` directly, which is both correct (the registry, not live DB content, is the intended source of truth for "which projects exist") and cheaper (no DB round-trip). No in-repo consumer of this endpoint was found.
- **Migration pipeline.** `tools/databases/migrations/targets/migrate.ts` already processed each project independently even under the shared schema (`DELETE FROM <table> WHERE project = ?` then insert just that project's rows) -- the split mainly changes *which output file* each project's data lands in, not the per-table extraction logic. `tools/databases/migrations/plan.ts` now plans one task per project (`Targets_<project>`) instead of one shared `Targets` task, via a new `family: 'Sources' | 'Ontology' | 'Targets'` field that groups the per-project tasks back together for validation config and script-directory lookup (`orchestrator.ts`) without losing per-project granularity in state tracking (`state.ts`) or output-file naming. `hard_required` is now empty for every project (previously `['English']` for the one shared task) -- a project with no raw file staged yet is planned as "nothing to build" rather than failing every other project's migration, which is the "freedom" half of the original rationale actually holding in the tooling, not just the app.
- **Local dev / E2E.** `scripts/dx/db_load.ts` already loops generically over every entry in a wrangler.jsonc's `d1_databases[]` (that's how it already handles ontology's two bindings) -- it required no code changes and was verified end-to-end against all 4 new bindings (see "Verified" below).

## Alternatives considered

**Per-project tables within one shared database.** See "Context" above -- rejected because it doesn't deliver write-concurrency isolation or access-control isolation, the two properties D1's model ties to the database, not the table.

**Status quo (single shared database, `project`-column filtering) plus just adding a missing index.** Would have been the pragmatic choice if query efficiency were the only real driver. Rejected because sovereignty and write-isolation were judged real, near-term needs for this project's user base (per-project translator teams), not hypothetical ones -- see the discussion this ADR closes out.

## Consequences

- **Provisioning a new project requires a Worker redeploy, unavoidably.** Cloudflare Workers bindings are static, resolved at deploy time -- there is no way to attach a new D1 database to a running Worker without redeploying it, no matter how automated provisioning becomes. The realistic flow stays: `wrangler d1 create`, add the binding + `database_id` to `wrangler.jsonc`, add the project to `TARGET_PROJECTS`, redeploy. An auto-provisioning flow was drafted once (`tools/databases/migrations/orchestrator.ts`, the commented-out block calling `wrangler d1 create` / `wrangler d1 execute --remote`) but was never finished -- it calls `update_deployment_config()` and `extract_new_db_info()`, neither of which exist anywhere in the codebase. Completing it is optional future work, not a blocker: manual provisioning is a one-time, infrequent, low-risk step per new project.
- **Minor data duplication.** `Form_Names` and `Source_Features` are derived independently per project from each project's own raw TBTA export; under the split they're duplicated across N databases rather than living once. These are small lookup tables, so this is a cost worth accepting, not a reason to reconsider.
- **No per-task failure isolation in the migration pipeline.** `orchestrator.ts` still runs its task loop sequentially and uncaught; if one project's `migrate.ts` invocation throws, the run stops there and no later task (including other, unrelated projects) executes that day. The *data processing* is now genuinely independent per project, but *pipeline execution* is not yet -- a real limitation, not solved by this change, and worth its own follow-up if a project's migration starts failing independently of others' health.
- **Platform limits are not a concern.** Confirmed live against Cloudflare's current docs: the Workers Paid plan allows 50,000 D1 databases per account and roughly 5,000 D1 bindings per Worker script -- far beyond any realistic target-language project count.

## Migration path / status

Code changes (registry, routing, binding resolution, migration pipeline, local dev snapshot loading) are complete and verified in this worktree:

- `pnpm --filter targets check`, `pnpm --filter @tabitha/types check`, and `pnpm --filter '@tabitha/databases' check` all pass; `check:lint` passes for all three.
- `tools/databases`' migration test suite (37 tests, including new/updated coverage in `plan.test.ts` for the per-project task split and the "no raw input yet" skip path) passes.
- The existing combined `raw/Targets_2026-07-31.tabitha.sqlite` was split by `project` into four new per-project files (`raw/Targets_<project>_2026-07-31.tabitha.sqlite`, row counts verified to match the source exactly: English 29,861 / Swahili 3,285 / Indonesian 5,312 / Tagalog 14,176) and dumped to matching D1-importable snapshots (`tools/databases/snapshots/Targets_<project>_2026-07-31.tabitha.sqlite.sql`).
- **Verified live** (Miniflare, not production D1): `pnpm db:load` (via `scripts/dx/db_load.ts targets`) loaded all four snapshots into local D1 state with zero code changes needed, and a real `pnpm dev` server correctly resolved `DB_Targets_English`/`DB_Targets_Swahili`/etc. per request -- `GET /` returned the registry; `GET /English` and `GET /Swahili` each returned that project's own (correctly different) book list; `GET /Spanish` (unregistered) 404'd at the route matcher before ever touching a binding; `GET /English/lookup/forms?word=loved` returned real lexical data.

**Done, 2026-08-30, as a separate step from the code change above:** the four real D1 databases were provisioned (`wrangler d1 create` × 4), the split snapshots imported into them (`wrangler d1 execute --remote`, row counts verified exact against the source), and `apps/targets/wrangler.jsonc`'s `database_id`s cut over from the placeholder values to the real ones.
