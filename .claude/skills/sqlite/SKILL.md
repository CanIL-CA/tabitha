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

When performing bulk inserts, migrations, or snapshot loading (e.g. `scripts/dx/db_load.ts`), always wrap operations in a single transaction with memory pragmas:

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

## 2. Query Plan Optimization & Indexing

### Inspecting Query Plans
Always check queries touching large linguistic tables (>100k rows) with `EXPLAIN QUERY PLAN`:

```sql
EXPLAIN QUERY PLAN
SELECT * FROM Concepts WHERE stem = 'write-01' AND language = 'en';
```

- **Target**: Ensure `USING INDEX` is shown. Avoid `SCAN TABLE` on large tables.

### Indexing Strategies
- **Composite Indexes**: Index column pairs frequently filtered together:
  ```sql
  CREATE INDEX idx_concepts_stem_lang ON Concepts (stem, language);
  ```
- **Covering Indexes**: Include selected columns in the index to avoid table B-tree lookups entirely:
  ```sql
  CREATE INDEX idx_senses_lookup ON WordSenses (concept_id, sense_number, gloss);
  ```
- **Unique Indexes**: Enforce integrity while providing indexed lookups:
  ```sql
  CREATE UNIQUE INDEX idx_verse_ref ON Verses (book, chapter, verse);
  ```

---

## 3. Schema Design & Table Types

### `WITHOUT ROWID` Tables
For pure lookup, mapping, or association tables with natural primary keys, use `WITHOUT ROWID` to eliminate the default 64-bit integer rowid and halve storage overhead:

```sql
CREATE TABLE SenseMapping (
	source_sense_id TEXT NOT NULL,
	target_sense_id TEXT NOT NULL,
	mapping_weight REAL NOT NULL,
	PRIMARY KEY (source_sense_id, target_sense_id)
) WITHOUT ROWID;
```

### Foreign Key Constraints
Always enable foreign key enforcement in active runtime connections:
```sql
PRAGMA foreign_keys = ON;
```

---

## 4. SQLite JSON Functions & FTS5 Search

### Querying Structured JSON Data
```sql
-- Extract scalar property
SELECT json_extract(metadata, '$.theological_class') FROM Concepts;

-- Unnest JSON arrays into rows
SELECT Concepts.id, tags.value
FROM Concepts, json_each(Concepts.metadata, '$.tags') AS tags;
```

### Full-Text Search (FTS5)
For fast searching across biblical commentaries and glossaries:
```sql
CREATE VIRTUAL TABLE SenseSearch USING fts5(
	concept_id UNINDEXED,
	gloss,
	definition,
	tokenize = 'porter unicode61'
);

-- Ranked BM25 query
SELECT concept_id, rank
FROM SenseSearch
WHERE SenseSearch MATCH 'covenant AND love'
ORDER BY rank;
```

---

## 5. Health, Maintenance & Snapshots

- **Integrity Check**:
  ```sql
  PRAGMA integrity_check;
  PRAGMA foreign_key_check;
  ```
- **Safe Hot Backup / Compaction**:
  ```sql
  VACUUM INTO 'backup.sqlite';
  ```
- **Streaming CLI Pipelines**: Use `sqlite3 <db_path>` with standard input pipes for zero-overhead snapshot execution.
