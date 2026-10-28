# DB_Ontology migrations

The live Ontology D1 is the single source of truth ([ADR 0025](../../../../docs/decisions/0025-ontology-d1-single-source-of-truth.md)), so a schema change is a D1 migration in this folder, applied in place. There is no baseline: numbering starts from the schema the live database already has.

1. Add the next file: `bun x wrangler d1 migrations create DB_Ontology <name>` (from `apps/ontology`).
2. Make the migration bump the version itself, because nothing in the app bumps MAJOR or MINOR (approved concept changes only bump the patch). End the file with:

   ```sql
   UPDATE Version SET version = '3.1.0';
   UPDATE OntologyVersion SET Version = '3.1.0';
   ```

   Use MINOR for an additive change and MAJOR for a breaking one (a removed table or renamed column), with the patch reset to 0, per CONTRIBUTING's semver section. The first migration ever applied also adds D1's `d1_migrations` table, so it bumps MINOR.
3. Locally, `bun run db:load:ontology` loads the pinned snapshot and then applies every migration it doesn't have yet.
4. Before the code that needs it merges, apply it to production: `bun x wrangler d1 migrations apply DB_Ontology --remote`. Keep migrations additive, so the code running in production keeps working once they're applied.
5. Bring the Previews copy level with production: `bun run refresh:preview` (from `tools/databases`).

A migration also reaches classic TBTA through the nightly backup. TBTA reads `Concepts`, `Version`, the `Rules_*` tables and others, and rejects a version outside its supported range, so ask Dave before a change to a table TBTA reads or a MAJOR bump.
