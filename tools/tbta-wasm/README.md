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

## From proof of concept to release

The POC shows that the engine generates the same text in a Worker and in a browser. Most of how it gets there was done by hand to prove that point. None of the rows below has been designed yet, so the "Release needs" column lists the problem rather than a settled answer.

| Area | POC today | Release needs |
| --- | --- | --- |
| Engine build | Built on a developer's machine from a pinned tbta commit (`engine:build`) | A repeatable, versioned build. Could be a tbta release artifact or a CI job with Emscripten; not decided. |
| Data prep | `engine:data` on a developer's machine. Newest Ontology looked up at run time, English only | Prepared databases produced the same way every time, with versions people can see. Dave's prepare-target-for-web workflow in tbta already does the upgrade, re-map and trim, and could replace `prepare_data.ts` (see below). |
| Ontology changes | Nothing happens. A language stays mapped to the Ontology it was prepared against until someone reruns `engine:data` | A way to keep each language database in step with Ontology releases. **Open:** how, and who triggers it. To discuss with Dave; related to [tbta#37](https://github.com/CanIL-CA/tbta/issues/37). |
| Choosing the pair | Fixed at deploy: the Worker bundles one Ontology and English | The host picks the language and Ontology at run time. Where the databases live (bundled, R2, elsewhere) and how many engines one Worker can hold (128 MB limit; English alone peaks at 86 MB) are open. |
| Deploy | `bun run deploy` by hand; CI can't build the engine | Deployed by the pipeline like the other apps, once the engine and data come from a build. |
| Sources panel | Experimental card on the verse page; merging would put it on production | A product decision on where generation appears and for whom. |
| Offline (browser) | Engine and databases download per visit, with ETags | A caching and update story if offline use is a goal. |
| Accuracy | Matches TBTA's stored text for Genesis 1:1-2 and Ruth 1:1-2. John 3:15-16 differs; not yet checked against native `tbta_utils` | A comparison against native TBTA over many verses. tbta's generation baselines (see below) may be the reference to compare against. |
| Tests and Windows | None, by design for a POC | Unit tests for the request handling and engine wrapper. The build tooling has to work on Windows too. |

### Related work in tbta

Checked 2026-11-19. Dave Havens owns these; ask him for the current state before building on them.

- **[Prepare target for web](https://github.com/CanIL-CA/tbta/blob/main/.github/workflows/prepare-target-for-web.yaml)** (tbta#48, #49, #50; merged). Takes a target database from R2, upgrades its schema, re-maps it to an Ontology (the newest `Ontology_*` backup unless one is given), drops the tables generation doesn't read, checks that a verse generates, and writes the result to the `poc/` R2 bucket. It can be started by hand or called from another workflow (`workflow_call`); `test-prep.yaml` shows the call. Not settled yet: versions in the output keys or a manifest, running it over every language, and who owns the list of tables to keep.
- **[tbta#37](https://github.com/CanIL-CA/tbta/issues/37)** (open). In classic TBTA, an Ontology update is applied to every target project, but a target's Sample upgrade only runs when that project is opened. The proposal there is to run the pending Sample upgrades first. Any automatic "re-map every language to a new Ontology" step would meet the same ordering problem.
- **[Generation baselines](https://github.com/CanIL-CA/tbta/blob/main/.github/workflows/make-generation-baselines.yaml) and [Test generation](https://github.com/CanIL-CA/tbta/blob/main/.github/workflows/test-generation.yaml)** (in use). The first records classic TBTA's generated text on Windows, as target databases under `db-classic/baseline/` in R2. The second checks native builds against them on tbta PRs, using TBTA's "Compare New Text with Saved Text" mode. Neither covers the WebAssembly build (`BrowserTest/**` changes skip the test).
