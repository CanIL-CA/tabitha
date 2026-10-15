# TaBiThA Survey (`@tabitha/survey`)

Link-only blinded A/B reviews at [survey.tabitha.bible](https://survey.tabitha.bible). Reviewers compare two outputs per item, pick the one they prefer, tick problems, and comment. Answers are saved as they go. Only the results link shows which output was which. The reasons for the design are in [ADR 0024](../../docs/decisions/0024-survey-app.md).

## Publishing a survey

A survey is a JSON file shaped like `SurveyDefinition` (`@tabitha/types/survey`). `apps/copilot`'s `bun run eval export <variant>` writes one from an eval report. Publish it from this folder:

```sh
bun run publish path/to/survey.json            # production, with your own wrangler login
bun run publish path/to/survey.json --local    # the local database, for bun run dev:survey
```

The script checks the file, randomly decides for each item which output shows as A, writes it to D1, and prints two links:

- **Review link** (`/r/<id>`): send this to reviewers.
- **Results link** (`/r/<id>/results?key=…`): keep this to yourself, since it reveals which output was which. Nothing else can recover the key, so save the link when it's printed.

Republishing a file creates a new survey with new links; it never changes an existing one.

## Local development

```sh
bun run db:load:survey      # from the repo root: builds the local database from migrations/
bun run dev:survey          # http://localhost:1086
```

## Database

`DB_Survey` is owned by `migrations/`. To change the schema, add the next numbered file (never edit an applied one), rebuild locally with `bun run db:load:survey`, and run `bunx wrangler d1 migrations apply DB_Survey --remote` from this folder before the code that needs it merges.
