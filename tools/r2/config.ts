/** Desired-state config for every Cloudflare R2 bucket the TaBiThA account holds, reconciled
 * against the live account by `apply.ts`. Every bucket should be declared here -- this is the
 * place to find out *why* a bucket exists and why its public-access setting is what it is,
 * instead of that living only in whoever created it's memory or the Cloudflare dashboard.
 */

export type BucketAccess =
	| { type: 'none' }
	/** Public via Cloudflare's shared, generic `<hash>.r2.dev` subdomain. */
	| { type: 'r2_dev' }
	/** Public via a dedicated custom domain, attached to a Cloudflare-hosted DNS zone. */
	| { type: 'custom_domain'; domain: string; zone_id: string }

export type DesiredBucket = {
	name: string
	access: BucketAccess
	/** Why this bucket exists and why its `access` is set the way it is. */
	reason: string
	/** Which app's `wrangler.jsonc` binds this bucket for Worker runtime access, or `null` if it's
	 * only ever touched by CLI/ops scripts outside any deployed Worker -- a `wrangler.jsonc`
	 * binding only makes sense for a bucket a Worker actually reads/writes at request time. This
	 * tool never creates or edits that binding; it's documentation only, kept next to the bucket
	 * it describes rather than only discoverable by grepping every app's `wrangler.jsonc`. */
	bound_in: { app: string; binding: string } | null
}

export const desired_buckets: DesiredBucket[] = [
	{
		name: 'db-backups',
		access: { type: 'custom_domain', domain: 'db-backups.tabitha.bible', zone_id: 'be132ce1c4b86f60623d1cd0d0f38a58' },
		reason:
			"Serves ontology's public /downloads page (apps/ontology/src/routes/downloads/+page.server.ts), which lists nightly D1 backups (written by tools/databases/migrations/backup/index.ts) and links directly to this bucket's objects rather than proxying them through the Worker. Public via a dedicated custom domain rather than the shared r2.dev subdomain so the download links are stable and branded; /downloads is intentionally outside ontology's session-auth gate (see hooks.server.ts) since these backups are meant to be publicly downloadable.",
		bound_in: { app: 'ontology', binding: 'R2_db_backups' },
	},
	{
		name: 'db-migration-data',
		access: { type: 'r2_dev' },
		reason:
			"Replaced Git LFS for tools/databases/raw/ and tools/databases/snapshots/ (see r2_sync.ts's header comment). Public via the generic r2.dev URL rather than a custom domain since its only consumer (r2_sync.ts's `pull` command) just needs anonymous HTTPS GETs to enumerate and fetch snapshots -- no need for a branded URL the way db-backups's /downloads page has.",
		bound_in: null,
	},
	{
		name: 'db-generation',
		access: { type: 'custom_domain', domain: 'db-generation.tabitha.bible', zone_id: 'be132ce1c4b86f60623d1cd0d0f38a58' },
		reason:
			"The Ontology and language databases TBTA text generation runs against, written by tbta's `prepare-target-for-web` workflow under <ontology-version>/ and downloaded by apps/generator's build (scripts/fetch_engine.ts) and by browsers that run the engine themselves. Public via a dedicated custom domain, not the shared r2.dev subdomain, because the address is part of the generator's build and needs to be stable; its own bucket, not db-backups, because ontology's /downloads lists all of db-backups and TBTA's updater reads the first Ontology it finds there. Keep the pinned Ontology version in apps/generator/scripts/engine_source.ts and the one before it.",
		bound_in: null,
	},
	{
		name: 'db-classic',
		access: { type: 'none' },
		reason: "Holds snapshots of databases used by the legacy TBTA app's command-line generation processes. CLI/ops-only -- no Worker binds it, so it stays private.",
		bound_in: null,
	},
]
