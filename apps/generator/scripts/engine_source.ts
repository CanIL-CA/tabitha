// Which engine and databases this app is built with. Both are produced by CanIL-CA/tbta's CI.
// Changing either line and merging is how a new engine or Ontology reaches production.

// A TBTA release on CanIL-CA/tbta-public that has the TBTA-Worker-WASM.tar.gz asset.
export const TBTA_RELEASE = 'v5.2.0'
// An Ontology version that tbta's prepare-target-for-web workflow has prepared LANGUAGE for.
export const ONTOLOGY_VERSION = '3.0.9627'
export const LANGUAGE = 'English'

export const ENGINE_ARCHIVE_URL = `https://github.com/CanIL-CA/tbta-public/releases/download/${TBTA_RELEASE}/TBTA-Worker-WASM.tar.gz`
// The public address of the db-generation R2 bucket (tools/r2/config.ts) that workflow writes to.
export const DATA_URL = `https://pub-bc602cc2247b4508bb596471bf7048ff.r2.dev/${ONTOLOGY_VERSION}`
