# TBTA engine as WebAssembly (proof of concept)

Builds TBTA's generation engine from [CanIL-CA/tbta](https://github.com/CanIL-CA/tbta) as a WebAssembly module that runs in a Cloudflare Worker or a browser's Web Worker, and prepares the databases it reads. Both land in `apps/generator/engine/` (gitignored), along with gzipped copies of the binary files for browsers to download.

This is a proof of concept. The engine itself comes unmodified from the tbta repo: the changes that make it buildable for a Worker were merged there in [CanIL-CA/tbta#45](https://github.com/CanIL-CA/tbta/pull/45).

## Requirements

- Read access to the private `CanIL-CA/tbta` repo through `git`
- [Emscripten](https://emscripten.org), CMake and Ninja on `PATH` (macOS: `brew install emscripten cmake ninja`)

## Usage

```sh
bun run engine:build   # about 75 s the first time; reuses the build cache afterwards
bun run engine:data    # downloads about 180 MB on first run, cached in .downloads/
```

`engine:build` checks out tbta at the commit pinned in `paths.ts` (the merge of #45) into `.tbta/` and builds its `BrowserTest` module with the `Worker-WASM-Local` preset from `CMakeUserPresets.json`. tbta's own `Worker-WASM-Release` preset only matches Linux hosts, so this one repeats it for a Mac or Windows machine.

`engine:data` downloads the English target database and two Ontologies, lets the engine upgrade and re-map English to the newest Ontology, drops the tables generation doesn't read, and generates Genesis 1:1 as a smoke test.

## What tbta#45 changed

Before it, the browser build fetched each verse's encoding over HTTP from a hardcoded `localhost:8787` URL. That needed threads (a synchronous fetch), and so cross-origin isolation in the browser. Now:

- `GenerateVerseFromEncoding` takes the verse's encoding and the previous verse's as strings, through `StringSourceProvider`.
- Threads and `-sFETCH` are gone.
- The module is an ES module (`create_tbta`) with no `eval`, as Cloudflare Workers require.

## How the engine and the data fit together

The `.wasm` has no databases in it. It is the same engine whatever language or Ontology it runs against. The databases are handed to it when it starts:

1. `load_engine` (`apps/generator/src/engine.ts`) creates `/persist` in Emscripten's in-memory filesystem and writes each database into it as plain bytes, in `preRun`, before the engine starts.
2. The engine opens `Ontology.sqlite` and `<Language>.sqlite` from there on the first generation.

### Where the pairing happens

A deployed generator does run against one fixed Ontology and one fixed language database, but compiling the engine doesn't fix that. Two later steps do: preparing the data and deploying the Worker.

1. **`engine:build`** compiles the engine. It has no input from any database.
2. **`engine:data`** (`prepare_data.ts`) produces one matched pair of databases:
   - It downloads the raw English export (`English_2026-07-31.tbta.sqlite`) and the Ontology that export was built against (3.0.9494), both from the R2 raw bucket.
   - It downloads the newest Ontology backup listed by `ontology.tabitha.bible/downloads`.
   - It runs the engine twice: once to upgrade the export's schema against 3.0.9494, which only works with that exact version, and once to re-map English to the newest Ontology.
   - It drops the tables generation doesn't read, and writes `Ontology.sqlite` and `English.sqlite` to `apps/generator/engine/`.
3. **`bun run deploy`** in `apps/generator` bundles that pair into the Worker. `src/index.ts` imports both files as static modules, so each deploy carries one Ontology and one language until the next deploy. The browser path downloads the same two files from the Worker.

The newest Ontology is looked up when `engine:data` runs, so rerunning it after the Ontology changes produces a different pair. Only the English export and the base Ontology are pinned, in `paths.ts`.

Running against a different Ontology or language therefore needs no rebuild of the engine. It needs a language database mapped to that Ontology's version, and a host that loads those bytes: one engine instance per language and Ontology pair, chosen at runtime. This POC doesn't do that yet.

**Still open:** how language databases and Ontology versions should be kept in step. The English export needed a two-step upgrade, and nothing yet re-maps a language when the Ontology changes. To be discussed with Dave.
