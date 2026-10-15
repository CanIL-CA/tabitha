# Copilot eval set

A fixed set of verses (`cases.ts`) for judging a model, prompt or settings change against today's output, instead of by eye. It runs the production pipeline unchanged. `eval_client.ts` applies a variant (`variants.ts`) around the AI client, and `cassette.ts` replays each case's recorded HTTP inputs, so every variant sees identical inputs and only the model calls go out.

```sh
bun run eval capture                       # record inputs from the live sources/targets APIs and Aquifer (no model calls)
bun run eval run baseline                  # generate every case with production settings
bun run eval run brief-thinking-low        # generate every case with a variant
bun run eval report brief-thinking-low     # compare it with the baseline: tokens, timing, automatic checks
bun run eval export brief-thinking-low     # write that comparison as a survey file for human review
```

- Needs `AI_GATEWAY_TOKEN` and `API_KEY_AQUIFER` in `apps/copilot/.env.local`. The eval uses the production sources and targets hosts from `.env`, so leave `PUBLIC_*_API_HOST` out of `.env.local` or point it at production.
- Everything generated lands in `eval/.data/`, which is gitignored: the captured inputs hold third-party text (Aquifer notes).
- `run` skips cases already generated for that variant, so rerunning after a failure only redoes the failed ones. Pass `--force` to regenerate everything.
- Eval calls skip the AI Gateway cache and report as feature `copilot-eval`, apart from real use.
- A full run is about 33 cases, 4 at a time, roughly 10 minutes. Re-capture when the sources/targets data or Aquifer changes for these verses; the baseline should be regenerated after a re-capture.

## Judging

`report` writes `eval/.data/reports/<baseline>-vs-<variant>.json` and prints a token and timing summary. Its automatic checks (same note triggers, section counts, word overlap) only catch a variant breaking something: running the baseline a second time already gives 16 of 30 cases a warning, about as many as a real variant. Whether a variant is as good is a human call.

`export` turns the report into a blinded A/B survey, where consultants pick the better output per verse and tick problems. Verses whose two outputs are identical are left out, and the results page counts them. Publish the file from `apps/survey`, which prints a link for reviewers and a results link for you:

```sh
cd ../survey && bun run publish ../copilot/eval/.data/surveys/baseline-vs-brief-thinking-low.json
```
