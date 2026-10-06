# TaBiThA Databases (`@tabitha/databases`)

This package contains the TBTA-to-TaBiThA ETL migration engine, reference datasets, and canonical SQL snapshot dumps for the TaBiThA translation platform.

---

## 🗄️ Managed Databases

| Database | Primary App | Description |
| :--- | :--- | :--- |
| **Ontology** | `apps/ontology` | Concepts, stems, glosses, grammatical categories, complexity hints, and pending changes |
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

The orchestrator only reprocesses what actually changed: staging skips restaging any individually-delivered source (Swahili, Sample, etc.) that's byte-identical to the last run, and each output (Sources, Targets) is either skipped entirely, incrementally rebuilt from the changed inputs on top of the prior output, or fully rebuilt, depending on what changed. A delivery doesn't need every database -- a folder or zip holding only `Ontology.sqlite`/`Ontology.new` rebuilds just the Ontology, reusing the latest staged Sources and Sources_Complex. One holding only target-language databases (e.g. `Indonesian.sqlite`) rebuilds just those projects' Targets and leaves the deployed Ontology as it is. An Ontology is required only when Sources changes, since its examples are built from Sources.

Each rebuilt output that passes validation is then deployed: the orchestrator creates a new date-stamped D1 database (e.g. `Ontology_9494_2026-09-29`), loads its snapshot, and repoints the owning app's `wrangler.jsonc` binding (top-level and `previews`) at it. Production keeps reading the old database until that `wrangler.jsonc` change is merged and deployed. This needs `wrangler login` (or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`) with D1 write access. Afterwards, run `bun run r2:push` and commit the updated `manifest.json` alongside the `wrangler.jsonc` change.

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

#### Ontology Migration

Populates the exhaustive concept examples (`Exhaustive_Examples`) in an already-staged Ontology database, from a migrated Sources database and its Sources_Complex export. It also normalizes NULL concept text columns to empty strings and rebuilds `Complex_Terms` from the how-to Google Sheet (network required), replacing whatever copy the TBTA export shipped:

```bash
cd tools/databases
bun run migrate:ontology \
  raw/Sources_YYYY-MM-DD.tabitha.sqlite \
  raw/Sources_Complex_YYYY-MM-DD.tabitha.sqlite \
  raw/Ontology_9494_YYYY-MM-DD.tabitha.sqlite
```

#### Auth Initialization

Creates default Auth permissions and role structures:

```bash
cd tools/databases
bun run migrate:auth databases/Auth.tabitha.sqlite
```

#### Status Update (Live D1)

Applies the latest verse-status CSVs (see `data/status/README.md` for how to export them) directly
to a live Sources D1 database, independent of any migration run:

```bash
cd tools/databases
bun run migrate:status <d1_database_name> [csv_dir] [YYYY-MM-DD]
```

`csv_dir` defaults to `data/status/`, and the date defaults to today -- both fall back to the latest
available file if an exact match isn't found.
