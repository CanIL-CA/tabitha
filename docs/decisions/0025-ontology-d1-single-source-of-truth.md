# 0025: The live Ontology D1 is the single source of truth

## Status

Accepted (2026-10-28).

## Context

Until now, the Ontology followed the same flow as Sources and Targets. Each TBTA delivery carried an `Ontology.sqlite` export, `tools/databases` migrated it into a brand-new date-stamped D1 (`Ontology_9494_<date>`, plus a `_preview_` copy for Previews, [0020](./0020-per-pr-worker-previews.md)), and a PR repointed `apps/ontology/wrangler.jsonc` at the new database.

That stopped fitting once the Ontology became editable in tabitha. Suggest, approve and create write to the live database (the `Changes` table, `Concepts` and `Version`), and each cutover replaced it with a fresh copy built from TBTA's export, leaving those edits behind. Every delivery also cost a new D1, a deploy, and a binding PR.

Classic TBTA now reads tabitha's data rather than producing it. Since TBTA 5.2.0, its updater reads the latest version from `ontology.tabitha.bible/downloads` and installs `db-backups.tabitha.bible/Ontology_<version>.tabitha.sqlite` over its local `Ontology.sqlite`.

## Decision

**The live Ontology D1 (`Ontology_9494_2026-09-29`) is the single source of truth. It's never replaced; changes are made to it in place.**

- **No more Ontology cutovers.** The orchestrator no longer stages, migrates or deploys an Ontology. A delivery's `Ontology.sqlite` is still read where it lands, because `tbta_utils` needs it to build Sources_Complex and the inflections. The database keeps its dated name; nothing parses it, and renaming would mean a new database.
- **Examples are rebuilt in place.** `Exhaustive_Examples` and `Concepts.occurrences` are built from Sources. When a run changes Sources, `examples:rebuild` exports the target database, builds the examples locally, loads them into `Exhaustive_Examples_next`, and swaps that in. It then recounts `occurrences` on the live database, so concepts created since the export are counted too. The orchestrator does this for the Previews copy. Production runs it once the Sources PR merges, the same moment the new Sources database goes live.
- **Schema changes are D1 migrations** (`apps/ontology/migrations/ontology`), like `DB_Auth` ([0021](./0021-better-auth-sessions-in-d1.md)). There's no baseline file: numbering starts from the schema the live database already has. Production gets `wrangler d1 migrations apply DB_Ontology --remote` before the code that needs a migration merges.
- **Every backup version is kept.** The nightly backup writes `db-backups/Ontology_<version>.tabitha.sqlite` and no longer prunes old versions. TBTA's updater fetches by version, and its target upgrade asks for the exact older version a target was built against. The names stay version-only, with no date, because TBTA builds that exact key.
- **Local dev and CI load a pinned snapshot.** The backup also uploads its SQL export as `db-migration-data/snapshots/Ontology_<version>.tabitha.sqlite.sql`, written once per version. `manifest.json`'s `pinned_snapshots` names the one `db:load` uses, then `db:load` applies any newer migrations. Moving the pin is a one-line PR, so the test data only changes when someone chooses to change it.
- **The Previews copy is refreshed on demand.** `refresh:preview` exports production, drops every table in the Previews copy, and loads the export, keeping its name and id. It runs by hand, after a migration or before testing a write-heavy PR. There's no cron.

## Alternatives considered

- **Keep dated cutovers and carry live edits forward.** This means copying `Changes` and every other edited table across each cutover. It keeps the rebuild-from-TBTA model, but the carry-forward has to know every table tabitha writes, and the deploy and binding PR stay.
- **Move the examples to their own dated database on the Sources pipeline.** The ownership is cleaner, since the examples derive from Sources, but the app would need a second binding, and the backup would have to merge them back into TBTA's download.
- **Snapshots that always track the latest backup.** These are always fresh, but e2e results could change from one day to the next with no code change.
- **A weekly cron for the Previews copy.** This is hands-off, but it's another scheduled job that writes to a database, for data Previews rarely need fresh.

## Consequences

- A Sources update leaves production's examples one step behind until `examples:rebuild production` runs after the merge. The orchestrator prints the command.
- The examples swap writes about 96 MB to the target database, and D1 handles one batch at a time per database. Measured on the Previews copy: loaded as a single import, 14 of 16 reads made during the 28 s load failed; loaded in 24 batches of about 4 MB (152 s), 23 of 122 failed with transient `7500` errors, and the swap itself takes about 8 s. Those reads came through `wrangler`, which doesn't retry, while D1 retries read-only queries from a Worker binding, so the app sees less. Run `examples:rebuild production` at a quiet time anyway, and expect a short burst of errors.
- The Previews copy drifts from production between refreshes, and a refresh discards whatever was written on Previews.
- Classic TBTA reads only `OntologyVersion`, needs a 3.x version, and remaps targets by `Concepts.ID` order. So `set_version` keeps writing both version tables, and a version bump is what tells TBTA there's an update.
- Pinned snapshots stay on R2 forever, since `r2:prune` only prunes dated families. That's one file per pin move.

## Open questions

- **D1 Time Travel.** Should the backups also record a Time Travel bookmark, or should a runbook cover restores instead? Time Travel restores a database in place, with 30 days of history on Workers Paid; it can't fork a copy or export a past point. `wrangler r2 object put` can't attach custom metadata. A bookmark can also be derived from a backup's upload time. This is for Dave to answer.
- **Edits in classic TBTA.** TBTA still edits its local `Ontology.sqlite` (concept fields, `Exhaustive_Examples`, `Rules_*`) and has an "Export Ontology" command. Those edits now diverge from the D1, and the next update download overwrites them. Whether those screens become read-only, or edits flow back to tabitha, is undecided.
