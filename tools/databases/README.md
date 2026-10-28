# TaBiThA Databases (`@tabitha/databases`)

This package contains the TBTA-to-TaBiThA ETL migration engine, reference datasets, and canonical SQL snapshot dumps for the TaBiThA translation platform.

---

## 🗄️ Managed Databases

| Database | Primary App | Description |
| :--- | :--- | :--- |
| **Ontology** | `apps/ontology` | Concepts, stems, glosses, grammatical categories, complexity hints, and pending changes. The live D1 is the source of truth; this pipeline only rebuilds its examples ([ADR 0025](../../docs/decisions/0025-ontology-d1-single-source-of-truth.md)) |
| **Sources** | `apps/sources` | Source texts (Bible, Community Development, Grammar Intro), verse records, and semantic encodings |
| **Targets** | `apps/targets` | Target language grammars, lexical entries, translation texts, and inflectional forms |
| **Auth** | `apps/ontology` | User profiles, permissions, and OAuth credentials |

---

## 📦 Package Contents

- **`raw/`**: Dated legacy TBTA SQLite exports and per-project TaBiThA outputs -- the ETL pipeline's inputs and intermediate artifacts.
- **`snapshots/`**: Point-in-time SQL snapshot dumps used to seed local and production D1 databases.
- **`migrations/`**: Bun/TypeScript ETL scripts that ingest legacy TBTA SQLite databases and transform them into normalized TaBiThA SQLite schemas.
- **`data/`**: Linguistic data assets feeding the migration pipelines:
  - `data/ideal_texts/`: Reference translation documents (`.docx`, `.SFM`) for target languages (Indonesian, Swahili, etc.).
  - `data/inflections/`: Inflection transformation scripts, source rules, and generated CSV tables.
  - `data/status/`: Historical and current verse translation status CSVs.

`raw/` and `snapshots/` are gitignored -- their actual file contents live in the `db-migration-data` Cloudflare R2 bucket, not in git (see "R2-Backed File Storage" below). `manifest.json` (which *is* committed) tracks which dated files currently exist.

---

## ☁️ R2-Backed File Storage (`raw/` & `snapshots/`)

These directories used to be tracked in Git LFS. They now live in the public `db-migration-data` R2 bucket instead, fetched on demand via `tools/databases/migrations/r2_sync.ts`:

```bash
cd tools/databases
bun run r2:pull              # fetch everything listed in manifest.json (raw/ + snapshots/)
bun run r2:pull -- raw       # fetch only raw/ (needed before running an ETL migration)
bun run r2:pull -- snapshots # fetch only snapshots/ (what bun run db:load actually needs)
```

Reads are anonymous HTTPS GETs against the bucket's public `r2.dev` URL -- no Cloudflare credentials needed, and this is what CI and `bun run db:load` (at the repo root) already do automatically. Already-present local files are never re-fetched.

After an ETL migration run produces new dated files in `raw/`/`snapshots/`, publish them:

```bash
cd tools/databases
bun run r2:push   # uploads any local file not yet in manifest.json, and updates it
bun run r2:prune  # deletes stale dated versions from R2, keeping the latest 2 per database
```

Ontology snapshots are the exception: the nightly backup (`migrations/backup/index.ts`) uploads `snapshots/Ontology_<version>.tabitha.sqlite.sql` once per version, and `manifest.json`'s `pinned_snapshots.DB_Ontology` names the one `db:load` uses. To move local dev and CI to newer Ontology data, add that file to the `snapshots` list and move the pin in the same PR. `r2:prune` never removes these, since only dated files are pruned.

`r2:push` and `r2:prune` shell out to `wrangler`, so they need a Cloudflare API token with R2 write access (`wrangler login`, or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` env vars -- same auth as `migrations/backup/index.ts`).

---

## 🔄 Running ETL Migrations

All migration commands are run from within this package directory (`cd tools/databases`). Run `bun run r2:pull -- raw` first if you don't already have the latest `raw/` files locally -- the pipeline diffs new input against the previous dated version to decide what needs rebuilding.

### 1. Full Migration (Orchestrator)

Runs all migrations sequentially against a directory of TBTA database exports, or a zip bundle containing them:

```bash
cd tools/databases
bun run migrate "<path_to_tbta_dbs_dir_or_zip>" YYYY-MM-DD
```

The orchestrator only reprocesses what actually changed: staging skips restaging any individually-delivered source (Swahili, Sample, etc.) that's byte-identical to the last run, and each output (Sources, Targets) is either skipped entirely, incrementally rebuilt from the changed inputs on top of the prior output, or fully rebuilt, depending on what changed. A delivery doesn't need every database: one holding only target-language databases (e.g. `Indonesian.sqlite`) rebuilds just those projects' Targets. A delivery's `Ontology.sqlite` is read only by `tbta_utils` and never staged or deployed, because the live Ontology D1 is the source of truth ([ADR 0025](../../docs/decisions/0025-ontology-d1-single-source-of-truth.md)).

Each rebuilt output that passes validation is then deployed: the orchestrator creates a new date-stamped D1 database (e.g. `Sources_2026-09-29`), loads its snapshot, and repoints the owning app's `wrangler.jsonc` binding (top-level and `previews`) at it. A new Sources or Targets database also gets D1 read replication turned on, since a new database starts with it off (`READ_REPLICATED_FAMILIES` in `migrations/deploy.ts`). Production keeps reading the old database until that `wrangler.jsonc` change is merged and deployed. This needs `wrangler login` (or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`) with D1 write access. Afterwards, run `bun run r2:push` and commit the updated `manifest.json` alongside the `wrangler.jsonc` change.

When Sources changed, the run also rebuilds the Ontology's examples in the Previews copy of `DB_Ontology` and prints the command for production. Run that command once the branch merges, when the new Sources database goes live (see "Ontology Examples" below).

### 2. Individual Database Migrations

Each migration pipeline can also be run independently:

#### Targets Migration (Multi-Language)

Accepts the base English database and any number of additional target language databases:

```bash
cd tools/databases
bun run migrate:targets \
  databases/English_YYYY-MM-DD.tbta.sqlite \
  databases/Swahili_YYYY-MM-DD.tbta.sqlite \
  databases/Indonesian_YYYY-MM-DD.tbta.sqlite \
  databases/Targets_YYYY-MM-DD.tabitha.sqlite
```

#### Sources Migration (Multi-Source)

Accepts any combination of source text databases:

```bash
cd tools/databases
bun run migrate:sources \
  databases/Bible_YYYY-MM-DD.tbta.sqlite \
  databases/CommunityDevelopmentTexts_YYYY-MM-DD.tbta.sqlite \
  databases/GrammarIntroduction_YYYY-MM-DD.tbta.sqlite \
  databases/MissionsDocuments_YYYY-MM-DD.tbta.sqlite \
  databases/Sources_YYYY-MM-DD.tabitha.sqlite
```

#### Ontology Examples

The Ontology isn't migrated: the live D1 is the source of truth, and its schema changes are D1 migrations in `apps/ontology/migrations/ontology/`. Only its exhaustive concept examples (`Exhaustive_Examples`, and `Concepts.occurrences`) come from this pipeline, because they're built from Sources. `examples:rebuild` exports the target database, rebuilds the examples locally from a migrated Sources database and its Sources_Complex export, loads them beside the live table and swaps them in:

```bash
cd tools/databases
bun run examples:rebuild <production|preview> \
  raw/Sources_YYYY-MM-DD.tabitha.sqlite \
  raw/Sources_Complex_YYYY-MM-DD.tabitha.sqlite
```

It refuses to write when the rebuild has more than 20% fewer examples than the live table, which usually means Sources failed to load.

#### Previews Ontology Copy

Ontology's per-PR Previews write to their own copy of `DB_Ontology`. `refresh:preview` resets it to production's data, keeping its name and id. Run it after applying a migration to production, or before testing a write-heavy PR; it discards anything written on Previews since the last refresh:

```bash
cd tools/databases
bun run refresh:preview
```

#### Auth

The Auth database isn't part of this pipeline. Its whole schema (permission tables and Better Auth's tables) is owned by D1 migrations in `apps/ontology/migrations/auth/`, which `db:load` applies to an empty local database ([ADR 0021](../../docs/decisions/0021-better-auth-sessions-in-d1.md)).

#### Status Update (Live D1)

Applies the latest verse-status CSVs (see `data/status/README.md` for how to export them) directly
to a live Sources D1 database, independent of any migration run:

```bash
cd tools/databases
bun run migrate:status <d1_database_name> [csv_dir] [YYYY-MM-DD]
```

`csv_dir` defaults to `data/status/`, and the date defaults to today -- both fall back to the latest
available file if an exact match isn't found.
