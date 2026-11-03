# Generator (proof of concept)

A Cloudflare Worker that generates English verse text from a semantic encoding, using TBTA's generation engine compiled to WebAssembly. Other apps call it through a service binding; it has no public URL.

Build the engine and its databases first with `tools/tbta-wasm` (see its README). Then `bun run dev` here.

**Deploying:** CI can't build the engine (no Emscripten), so this Worker has no `build` script and isn't deployed by the pipeline. Deploy it by hand with `bun run deploy` after rebuilding the engine or its data. It's a plain Worker with no Vite build, so a local `.env.local` can't leak into it. Sources reaches it through its `GENERATOR` service binding, including from per-PR previews.

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

## Performance (measured 2026-11-03)

The first generation in a fresh Worker instance costs about 5 s of CPU on Cloudflare (about 1 s locally) while the engine loads its lexicons. Later verses take 40 to 120 ms. Calling `/warm` when a user opens a verse hides most of that wait. Memory peaked at 86 MB of the 128 MB limit.
