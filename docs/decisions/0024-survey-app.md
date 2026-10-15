# 0024: Blinded A/B reviews in their own app, `apps/survey`

## Status

Accepted.

## Context

Judging a change to copilot's model settings needs people, not just numbers. The copilot eval (`apps/copilot/eval`) measures cost and timing and runs structural checks, but those checks can't tell a variant from noise: running the baseline a second time flagged 16 of 30 cases, and the `brief-thinking-low` variant flagged 17. Translation consultants have to compare the two outputs verse by verse, without knowing which is which.

Most of those reviewers have no Claude access, and the team doesn't ask linguists to sign up for new platforms. A claude.ai artifact couldn't collect the scores: CanIL's org has link sharing turned off, and an artifact's storage refuses writes from anyone without a claude.ai account. The stopgap artifact asked each reviewer to copy their scores into the team chat, and someone pasted them back in to count them.

## Decision

**A new SvelteKit app, `apps/survey` at `survey.tabitha.bible`, runs link-only blinded A/B reviews and stores every answer in its own D1 database.** It's generic rather than copilot-specific, so later comparisons can reuse it.

- **Two outputs per item, rubric per survey.** A survey file (`SurveyDefinition` in `@tabitha/types/survey`) lists items. Each item has context blocks and exactly two outputs, rendered as titled sections of lists. Each survey sets its own preference scale (an odd number of choices), issue checkboxes, and comment prompt.
- **Blinding happens at publish time.** For each item, the publish script randomly decides which output shows as A. Reviewers get the outputs already in A/B order and never receive the side assignment, the output names, or the publisher's results-only figures.
- **No accounts.** A survey has one unguessable link (`/r/<id>`). Reviewers type a name, and a cookie scoped to that survey's path holds a random reviewer id, so they can come back and pick up where they left off. Results are at a second link carrying a secret key (`/r/<id>/results?key=…`), because they reveal which output was which.
- **Publishing is a script, not an endpoint.** `bun run publish <file>` in `apps/survey` checks the file, assigns sides, writes it to D1 with the publisher's own wrangler login, and prints both links. The app has no route that creates surveys and no publish secret. `bun run eval export <variant>` in `apps/copilot` writes a survey file from an eval report.
- **The schema is owned by D1 migrations** (`apps/survey/migrations`), like `DB_Auth` ([0021](./0021-better-auth-sessions-in-d1.md)). The database is undated (`Survey`) because it's long-lived, not a TBTA-derived snapshot.
- **No per-PR Previews.** A Preview would read and write the production database ([0020](./0020-per-pr-worker-previews.md)), so a tester's answers would land among real reviewers'. Changes are tried locally (`bun run dev:survey`, `bun run publish <file> --local`).
- **First app created by `tools/workers`.** `apply:run` uploads a placeholder Worker and connects it to the repo before the PR merges, so the merge itself deploys the app. No dashboard step is needed.

## Alternatives considered

- **A claude.ai artifact.** Rejected for the sharing and storage limits described above.
- **A route inside `apps/copilot`.** This would be less to set up, but it ties a general review tool to one app's deploys and data. It would also put reviewer data in an app that otherwise stores none.
- **Per-reviewer links.** These give a clearer record of who answered, and a leaked link exposes only one reviewer. But the publisher has to know every reviewer in advance, and adding one means publishing again.
- **Google sign-in through ontology's Better Auth.** This gives the strongest identity, but it ties the survey app to auth, and some consultants don't have Google accounts or don't want to use them for this.
- **A publish endpoint guarded by a Worker secret.** This would make publishing one command and ready for other callers, but it adds a public write route, a secret to set and rotate, and auth tests. If an app ever needs to publish while running, an endpoint or service binding can be added then.
- **Two or more outputs per item.** A single A-vs-B scale doesn't stretch cleanly to three outputs; ranking or per-output scores would be needed. It waits for a real need.

## Consequences

- Anyone holding a review link can answer under any name. That's acceptable for invited reviewers; the cost of misuse is a polluted survey, which the publisher can see on the results page.
- Publishing needs wrangler access to the account, which today means a developer runs it.
- Each survey's items are stored as JSON, and D1 caps one SQL statement at 100 KB, so one item's outputs have to fit in that. The publish script refuses oversized items.
- The www privacy policy covers survey: the typed name, answers and comments, and the reviewer cookie.
