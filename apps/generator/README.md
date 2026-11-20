# Generator

A Cloudflare Worker that generates English verse text from a semantic encoding, using TBTA's generation engine compiled to WebAssembly. Other apps call it through a service binding; it has no public URL.

```sh
bun run dev     # downloads the engine and databases on first run, then starts the Worker
bun run build   # the same download, then a dry-run bundle; what the deploy pipeline runs
```

## Where the engine and the databases come from

Nothing is built here. [CanIL-CA/tbta](https://github.com/CanIL-CA/tbta)'s CI produces everything, and `scripts/fetch_engine.ts` downloads it into `engine/` (gitignored):

| File | Produced by | Downloaded from |
| --- | --- | --- |
| `tbta.js`, `tbta.wasm` | tbta's `wasm-engine` workflow, as `TBTA-Worker-WASM.tar.gz` | A release on [CanIL-CA/tbta-public](https://github.com/CanIL-CA/tbta-public/releases) |
| `Ontology.sqlite`, `English.sqlite` | tbta's `prepare-target-for-web` workflow | `<ontology-version>/` in the `db-generation` R2 bucket (`db-generation.tabitha.bible`, declared in `tools/r2/config.ts`) |

`scripts/engine_source.ts` pins the TBTA release and the Ontology version. **To move to a new engine or Ontology, change the line there and merge.** The Ontology version has to be one the workflow has already prepared English for.

After downloading, the script checks that:

- neither database is in WAL mode (the engine opens them from an in-memory filesystem, where WAL can't work),
- the Ontology is the pinned version and English is mapped to it,
- the engine generates Genesis 1:1 from `scripts/genesis_1_1.encoding.txt`.

A failed check fails the build, so a mismatched pair can't be deployed. The script also writes gzipped copies for browsers.

## How the engine and the data fit together

The `.wasm` has no databases in it. It is the same engine whatever language or Ontology it runs against. The databases are handed to it when it starts:

1. `load_engine` (`src/engine.ts`) creates `/persist` in Emscripten's in-memory filesystem and writes each database into it as plain bytes, in `preRun`, before the engine starts.
2. The engine opens `Ontology.sqlite` and `<Language>.sqlite` from there on the first generation.

A deployed generator does run against one fixed Ontology and one fixed language database. Two things fix that pair, and neither is how the engine is compiled:

- **The language database.** tbta's workflow maps it to one Ontology version, and the engine needs it to match the Ontology it is given.
- **The Worker bundle.** `src/index.ts` imports both databases as static modules, so each deploy carries the pair pinned in `engine_source.ts`. The browser path downloads the same two files.

Running against a different Ontology or language therefore needs no rebuild of the engine. It needs a language database mapped to that Ontology's version, and a host that loads those bytes.

## API

- `POST /generate`: generates one verse.
  - **Body:** `{ book, chapter, verse, encoding, previous_encoding?, audience?, segment? }`
    - `book` is TBTA's book number (Genesis = 1, Ruth = 8, John = 43).
    - `encoding` is the verse's `semantic_encoding` from sources.
    - `previous_encoding` is the previous verse's, which the engine uses when a sentence continues across verses.
    - `audience` is 1 to 4 (default 1).
    - `segment` is where generation stops: `complex_concept_insertion`, `last_structured` or `last` (default).
  - **Response:** `{ text }`, `400 { error }` for a bad request, or `422 { error, log }` when the engine produced nothing.
- `POST /warm`: loads the engine without generating anything, returns `{ ready: true }`.
- `GET /files/<name>`: the engine's files, for browsers that run it themselves: `tbta.js`, `tbta.wasm.gz`, `Ontology.sqlite.gz` and `English.sqlite.gz` (about 2.7 MB in all). Served from `engine/` as static assets, with ETags. Sources passes them on at `/generator/<name>`, and its `lib/generation/engine_worker.ts` runs the engine in a Web Worker.

## Performance (measured 2026-11-03, on an earlier build of the engine)

The first generation in a fresh Worker instance costs about 5 s of CPU on Cloudflare (about 1 s locally) while the engine loads its lexicons. Later verses take 40 to 120 ms. Calling `/warm` when a user opens a verse hides most of that wait. Memory peaked at 86 MB of the 128 MB limit.

In Chromium on a Mac, the browser engine downloaded and started in about 1 s, then generated verses offline in 30 to 370 ms, with text identical to this Worker's.

## Accuracy so far

Genesis 1:1-2 and Ruth 1:1-2 match TBTA's stored text exactly. John 3:15-16 differs from the stored text, but native `tbta_utils` produces the same text as the engine there (checked 2026-11-19 on the English export and the Ontology it was built against), so the stored text looks older than the current rules. That is a guess, and only these verses were checked.

## What this first version leaves out

| Area | Today | Not decided yet |
| --- | --- | --- |
| Ontology changes | Nothing happens until someone runs tbta's prepare workflow and bumps `engine_source.ts` | Whether and how that should be automatic. Related: [tbta#37](https://github.com/CanIL-CA/tbta/issues/37), where an Ontology update reaches every target but a target's Sample upgrade only runs when it is opened. |
| Languages | English only, fixed at deploy | Choosing the language and Ontology at run time. How many engines one Worker can hold (128 MB limit; English alone peaks at 86 MB) are open. |
| Accuracy | A handful of verses compared | A comparison against native TBTA over many verses. tbta's generation baselines (`db-classic/baseline/` in R2, checked by its `test-generation` workflow) may be the reference; they don't cover the WebAssembly build today. |
| Offline (browser) | Engine and databases download per visit, with ETags | A caching and update story, if offline use is a goal. |
| Sources panel | The "Generate English text" card on the verse page | Where generation appears in sources, and for whom. |
