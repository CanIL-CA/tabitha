# Targets API & Explorer

- **Live URL**: [https://targets.tabitha.bible](https://targets.tabitha.bible)
- **Local Dev URL**: [http://localhost:1382](http://localhost:1382) (Port `1382`)

---

## 🔌 API

### 1. Hierarchical Navigation APIs

- `GET /` — Returns list of available target projects (e.g. `["English"]`).
- `GET /[project]` — Returns list of books for a project (e.g. `/English`).
- `GET /[project]/[book]` — Returns list of chapters for a book (e.g. `/English/John`).
- `GET /[project]/[book]/[chapter]` — Returns list of verses for a chapter (e.g. `/English/John/1`).
- `GET /[project]/[book]/[chapter]/[verse]` — Returns `{ reference, texts: [{ text, audience, ideal? }] }` for a verse (e.g. `/English/John/1/1`).

### 2. Search API

- `GET /[project]/search?q={query}` — Searches target translation text for a given query string.
  - **Query Params:**
    - `q` (`string`, required) — Search terms or pattern.
    - `mode` (`string`, optional) — `target` (default) or `reference`. Omitting it keeps the
      original target-text behavior, so existing callers are unaffected. Named for *which corpus*
      is searched, not the query syntax -- both modes accept the same quoted-exact-phrase syntax
      (see below), so a name like "phrase" never actually distinguished them.
  - **Example:** `/English/search?q=love`

- `GET /[project]/search?mode=reference&q={phrase}` — Finds the verses of a **published reference
  Bible version** (not our own target-language translation -- see the table below for which
  version each project searches) whose text contains the phrase, and that we hold a semantic
  encoding for. Verses without one are dropped rather than listed as unavailable -- a match with
  no structure to show isn't a useful exemplar.
  - Every word in `q` must be present in the verse, in any order and any distance apart, unless
    `q` is wrapped in double quotes (straight or curly), which requires the exact phrase, in
    order, literally.
  - **Example:** `/English/search?mode=reference&q=kingdom%20of%20heaven`
  - **Example (exact phrase):** `/English/search?mode=reference&q=%22kingdom%20of%20heaven%22`
  - **Returns:** `{ matches: [{ reference }], complete, notice }`
    - `complete` — `false` when the query was common enough that we stopped paging before the end
      of the results; there may be more verses than the ones listed.
    - `notice` — `unsupported_project` when the project has no reference Bible to search against
      (currently Tagalog), `unavailable` when the upstream lookup failed, otherwise `null`.

#### Which reference Bible each project searches

| Project | Reference Bible |
| --- | --- |
| English | New International Version (NIV), 2011 |
| Swahili | Biblica Open Kiswahili Contemporary Version (Neno) |
| Indonesian | Plain Indonesian Translation (TSI), 62 of 66 books |
| Tagalog | *unsupported* — no Bible on our API.Bible account for this language |

#### Why reference-translation search returns no verse text

The JSON response deliberately carries **references only, never the matching scripture text**.

Reference-translation search runs against a licensed Bible from [API.Bible](https://api.bible),
and that license is conditioned on reporting every scripture view through their Fair Use
Management System (FUMS). We can only honor that for pages we render ourselves, where the
tracking call fires once the verses are on screen — we can't fire it on behalf of an API consumer.
Returning the text here would put licensed scripture outside the mechanism the license depends on.

Verse references are plain facts and carry no such restriction, so they're free to consume.

**If you need the verse text**, fetch it yourself from the references we return, under your own
license:

1. Request a key and the Bible you need at [api.bible](https://api.bible) (non-commercial
   agreements are available for non-monetized projects).
2. Fetch each verse via their API, using the `reference` values from the `matches` array.
3. Implement FUMS tracking in whatever renders that text — it's a condition of the license, not an
   optional extra.

The browser-facing search page at the same URL does render the text, because it also fires the
tracking. That difference is intentional, not an inconsistency.

### 3. Lexical & Feature Lookup APIs

- `GET /[project]/lookup/features?category={category}` — Returns source and lexical grammatical features for the target project.
  - **Query Params:** `category` (`string`, optional) — Filter by category (e.g. `Noun`, `Verb`).
  - **Example:** `/English/lookup/features?category=Noun`

- `GET /[project]/lookup/forms?word={word}` — Look up lexical stem matches and inflected forms.
  - **Query Params:** `word` (`string`, required) — Word or pattern (supports wildcards `*`, `#`, `%`).
  - **Example:** `/English/lookup/forms?word=followed`

---

## 💻 Local Development

From the **monorepo root**:

```bash
# Run Targets dev server only
bun run dev:targets

# Or run all apps concurrently
bun run dev
```

Or from within `apps/targets`:

```bash
bun run dev
```

---

## ✅ Testing & Verification

For unified monorepo testing, linting, and build verification commands, see [CONTRIBUTING.md](../../CONTRIBUTING.md) or run `bun run precommit`.
