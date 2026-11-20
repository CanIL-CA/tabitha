---
name: sqlite
description: SQLite engine optimization, database schema design, and CLI tooling skill. MANDATORY when writing, optimizing, or debugging SQLite queries, schema migrations, snapshot loaders, dump tools, PRAGMA tuning, indexes, or FTS5 full-text search across TaBiThA tools and D1 databases.
metadata:
  version: 3.x
---

# SQLite Optimization & Architecture Best Practices

Guidelines for high-performance SQLite schema design, query optimization, and tooling operations in TaBiThA.

---

## 1. High-Throughput Bulk Operations & Pragmas

When bulk-loading a local SQLite file (as `scripts/dx/db_load.ts` does for snapshots), wrap the statements in a single transaction with memory pragmas. This is for local files only: D1 rejects SQL `BEGIN TRANSACTION`, so group D1 writes with `db.batch([...])` (see the cloudflare-workers skill).

```sql
PRAGMA synchronous = OFF;
PRAGMA journal_mode = MEMORY;
PRAGMA cache_size = 100000;
PRAGMA temp_store = MEMORY;

BEGIN TRANSACTION;
-- Bulk statements / snapshot inserts
COMMIT;
```

- **Why**: Wrapping 100,000+ statements in an explicit `BEGIN TRANSACTION ... COMMIT` converts individual per-statement disk syncs into a single batch write, yielding **500x–1,000x faster** execution.

---

## 2. Queries and schema

Read the real schema before writing a query or migration: the app's `migrations` directory where it has one, or the loaded local database (`bun run db:status`). Don't assume table or column names. On large tables, check the plan with `EXPLAIN QUERY PLAN` and add an index where it shows a `SCAN`.

---

## 3. Health, Maintenance & Snapshots

- **Integrity Check**:
  ```sql
  PRAGMA integrity_check;
  PRAGMA foreign_key_check;
  ```
- **Safe Hot Backup / Compaction**:
  ```sql
  VACUUM INTO 'backup.sqlite';
  ```
- **Running `sqlite3` from scripts**: call it through Bun's `$` with arguments (as `tools/databases/migrations/ontology/examples.ts` does), not a shell pipe, which `cmd.exe` can't parse (AGENTS.md, "Writing Cross-Platform Scripts & Tools").
