import type { D1Database } from '@cloudflare/workers-types'
import { get_all_verses_in_chapter } from './zoho'
import type { SecondaryIdReference, Reference } from '@tabitha/types'

export async function sync_in_progress_phase_1(db: D1Database): Promise<void> {
	const chapters_to_sync = await get_chapters_in_progress(db)

	if (chapters_to_sync.length < 1) {
		console.info('No chapters are in progress.')
		return
	}

	const update_stmt = db.prepare(`
		UPDATE Sources
		SET phase_1_encoding = ?
		WHERE type = ? AND id_primary = ? AND id_secondary = ? AND id_tertiary = ?
			AND (status = 'Initial Analysis in Progress' OR (status = 'Initial Analysis Complete' AND semantic_encoding = ''))
	`)

	for (const { type, id_primary, id_secondary } of chapters_to_sync) {
		console.info(`Fetching phase 1 for ${id_primary} ${id_secondary}.`)
		const verse_data = await get_all_verses_in_chapter({ book: id_primary, chapter: Number(id_secondary) })
		
		if (verse_data.length < 1) {
			console.info(`No phase 1 found for any verses within ${id_primary} ${id_secondary}.`)
			return
		}

		const update_stmts = verse_data.map(({ verse: { verse }, he2 }) => 
			// all the ids in the db are TEXT, so numbers won't match
			update_stmt.bind(he2, type, id_primary, id_secondary, verse.toString()),
		)

		console.info(`Updating phase 1 for ${verse_data.length} verses in ${id_primary} ${id_secondary}...`)

		try {
			await db.batch(update_stmts)
			console.info(`Successfully updated phase 1 for ${verse_data.length} verses in ${id_primary} ${id_secondary} in D1 database.`)
		} catch (error) {
			const message = error instanceof Error ? error.message : `${error}`
			console.warn(`Error updating phase 1 for ${id_primary} ${id_secondary}: ${message}`)
		}

	}

	console.info('Done phase 1 scraping from Zoho.')
}

async function get_chapters_in_progress(db: D1Database): Promise<SecondaryIdReference[]> {
	const sql = `
		SELECT id_primary, id_secondary FROM ChapterStatus
		WHERE status = 'Initial Analysis in Progress' OR status = 'Initial Analysis Complete'
	`
	const { results } = await db.prepare(sql).all<Pick<Reference, 'id_primary' | 'id_secondary'>>()
	return results.map(result => ({ type: 'Bible', ...result }))
	// .filter(r => r.book === 'Jeremiah').slice(0, 1)
}
