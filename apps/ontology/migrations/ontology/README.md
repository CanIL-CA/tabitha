# DB_Ontology migrations

The live Ontology D1 is the single source of truth ([ADR 0025](../../../../docs/decisions/0025-ontology-d1-single-source-of-truth.md)), so a schema change is a D1 migration in this folder, applied in place. There is no baseline: numbering starts from the schema the live database already has.

1. Add the next file: `bun x wrangler d1 migrations create DB_Ontology <name>` (from `apps/ontology`).
2. Locally, `bun run db:load:ontology` loads the pinned snapshot and then applies every migration it doesn't have yet.
3. Before the code that needs it merges, apply it to production: `bun x wrangler d1 migrations apply DB_Ontology --remote`. Keep migrations additive, so the code running in production keeps working once they're applied.
4. Bring the Previews copy level with production: `bun run refresh:preview` (from `tools/databases`).

A migration also reaches classic TBTA through the nightly backup, so ask Dave before changing a table TBTA reads (`Concepts`, `OntologyVersion` and the `Rules_*` tables, among others).
