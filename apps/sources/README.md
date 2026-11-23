# Sources API & Explorer

- **Live URL**: [https://sources.tabitha.bible](https://sources.tabitha.bible)
- **Local Dev URL**: [http://localhost:1947](http://localhost:1947) (Port `1947`)

---

## 🔌 API

### 1. Hierarchical Navigation APIs

- `GET /` — Returns list of available source types (e.g. `["Bible"]`).
- `GET /[type]` — Returns primary IDs (books) for a given type (e.g. `/Bible`).
- `GET /[type]/[id_primary]` — Returns secondary IDs (chapters) for a primary ID (e.g. `/Bible/Acts`).
- `GET /[type]/[id_primary]/[id_secondary]` — Returns tertiary IDs (verses) for a secondary ID (e.g. `/Bible/Acts/10`).
- `GET /[type]/[id_primary]/[id_secondary]/[id_tertiary]` — Returns full source data and parsed semantic encoding for a verse (e.g. `/Bible/Acts/10/9`).

### 2. Simplified Encoding API

- `GET /[type]/[id_primary]/[id_secondary]/[id_tertiary]/simple-json` — Returns simplified, flattened JSON for a verse's semantic encoding.
  - **Query Params:** `glosses` (`true` | `false`) — Includes concept glosses from Ontology API.
  - **Example:** `/Bible/Acts/10/9/simple-json?glosses=true`

### 3. Search

- `GET /search?q={query}` — If the query names a reference (e.g. `Acts 10:9`), redirects (`303`) to the canonical resource path. Otherwise renders a page of Bible verses whose Phase 1 encoding contains every word in the query (whole words, any order; quote a run of words to require it as an exact phrase).

### 4. Encoding Analysis & Parsing APIs

- `GET /analyze?text={encoding}` — Analyzes raw text using the Editor API analyzer and resolves feature codes against the database.
- `GET /raw-to-json?raw_encoding={encoding}&simple={true|false}&project={project}` — Converts raw TBTA semantic or target encoding into JSON.

### 5. Lookups & Status APIs

- `GET /lookup/features?category={category}` — Returns grammatical features, feature codes, values, and examples.
- `GET /lookup/status/[type]` — Returns translation/completion status for every book of a given type.
- `GET /lookup/status/[type]/[id_primary]` — Returns translation/completion status for an entire book.
- `POST /lookup/status` — Batch lookup for verse statuses. Expects a JSON array of reference objects `[{ type, id_primary, id_secondary, id_tertiary }]`.
  - **Returns:** one result per reference, in the order they were sent — `[{ reference, status }]`.
  - `status` is workflow status (`Not Started`, `Initial Analysis in Progress`, `Initial Analysis Complete`, `Final Review in Progress`, `Ready to Translate`), from the team's own tracking. It is **not** a reliable indicator of whether a verse has a semantic encoding — use `/lookup/encoded` for that.
- `POST /lookup/encoded` — Batch lookup for whether each verse actually holds a semantic encoding. Same request shape as `/lookup/status`.
  - **Returns:** one result per reference, in the order they were sent — `[{ reference, has_encoding }]`.
  - This is a separate endpoint from `/lookup/status`, not an extra field on it, because the two are populated by independent migrations that never consult each other: `semantic_encoding` comes from the TBTA export, `status` from a separate verse-status CSV tracking the team's own workflow phases. A verse's status is not a stand-in for whether its encoding exists.

---

## 💻 Local Development

From the **monorepo root**:

```bash
# Run Sources dev server only
bun run dev:sources

# Or run all apps concurrently, the generator included
bun run dev
```

Text generation on the verse and edit pages calls the generator Worker through a service binding, locally too, so `dev:sources` alone can't generate. Start the generator beside it with `bun run dev:generator`, or use `bun run dev`.

Or from within `apps/sources`:

```bash
bun run dev
```

---

## ✅ Testing & Verification

For unified monorepo testing, linting, and build verification commands, see [CONTRIBUTING.md](../../CONTRIBUTING.md) or run `bun run precommit`.
