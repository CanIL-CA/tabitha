# TBTA engine as WebAssembly (proof of concept)

Builds TBTA's generation engine from [CanIL-CA/tbta](https://github.com/CanIL-CA/tbta) as a WebAssembly module that runs in a Cloudflare Worker, and prepares the databases it reads. Both land in `apps/generator/engine/` (gitignored).

This is a proof of concept. If it works out, the changes in `tbta.patch` belong in the tbta repo itself.

## Requirements

- Read access to the private `CanIL-CA/tbta` repo through `git`
- [Emscripten](https://emscripten.org), CMake and Ninja on `PATH` (macOS: `brew install emscripten cmake ninja`)

## Usage

```sh
bun run engine:build   # about 75 s the first time; reuses the build cache afterwards
bun run engine:data    # downloads about 180 MB on first run, cached in .downloads/
```

`engine:build` checks out tbta at the commit pinned in `paths.ts` into `.tbta/`, applies `tbta.patch`, and builds the `Worker-WASM-Release` preset from `CMakeUserPresets.json`.

`engine:data` downloads the English target database and two Ontologies, lets the engine upgrade and re-map English to the newest Ontology, drops the tables generation doesn't read, and generates Genesis 1:1 as a smoke test.

## What the patch changes

Dave's browser build fetches each verse's encoding over HTTP from a hardcoded `localhost:8787` URL, which needs threads (synchronous fetch) and so cross-origin isolation in the browser. The patch adds three CMake options, all off by default so the existing build is unchanged:

| Option | Effect |
| --- | --- |
| `TBTA_STRING_SOURCE` | Adds `GenerateVerseFromEncoding`, which takes the verse's encoding (and the previous verse's) as strings, through a new `StringSourceProvider` |
| `TBTA_NO_THREADS` | Drops `-pthread`, `-sUSE_PTHREADS` and `-sFETCH` |
| `TBTA_CF_WORKER` | Emits an ES module (`create_tbta`) with no browser- or Node-specific startup code and no `eval` |
