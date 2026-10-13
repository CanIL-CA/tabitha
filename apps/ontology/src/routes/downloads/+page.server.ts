import type { R2Object, R2Objects } from '@cloudflare/workers-types'
import type { PageServerLoad } from './$types'
import { get_version } from '$lib/server/ontology'
import { get_version_applied_date } from '$lib/server/changes/changes'

type Backup = {
	size_mb: number,
	created_at: Date,
	url: string,
	version: string,
}

const VERSION_REGEX = /^Ontology_([\d-]+)\.tabitha.sqlite$/

export async function load({ locals: { db_ontology }, platform }: Parameters<PageServerLoad>[0]) {
	console.info('checking for downloads...')

	// https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#bucket-method-definitions
	const { objects }: R2Objects = await platform!.env.R2_db_backups.list()

	if (!objects) {
		return { backups: [], pending: true }
	}

	const backups = (await Promise.all(objects.map(transform))).toSorted(most_recent_first)

	const current_version = await get_version(db_ontology)
	const most_recent_backup_version = backups[0]?.version
	const pending = current_version !== most_recent_backup_version

	return {
		backups,
		pending,
	}

	async function transform(obj: R2Object): Promise<Backup> {
		// get the created_at date from a change applied in this version
		const version = extract_version(obj.key)
		const applied_date = await get_version_applied_date({ db: db_ontology, version })
		return {
			size_mb: bytes_to_mb(obj.size),
			created_at: applied_date ?? new Date(obj.uploaded),
			url: `https://db-backups.tabitha.bible/${obj.key}`,
			version,
		}
	}

	function extract_version(key: string) {
		const match = key.match(VERSION_REGEX)
		return match?.[1].replaceAll('-', '.') ?? ''
	}

	function bytes_to_mb(bytes: number) {
		return Math.round(bytes / (1024 * 1024))
	}

	function most_recent_first(a: Backup, b: Backup) {
		return b.created_at.getTime() - a.created_at.getTime()
	}
}
