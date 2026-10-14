import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { Reference, SourceEncodedResult } from '@tabitha/types'

/**
 * Reports which of `references` actually hold a semantic encoding.
 *
 * Deliberately separate from `get_verse_statuses` in `status.ts`, even though both are batch
 * lookups against the same `Sources` table: `status` and `semantic_encoding` are populated by
 * two independent migrations (the team's verse-status CSV, and the TBTA export) that never
 * consult each other, so a verse's workflow status is not a reliable stand-in for whether its
 * encoding actually exists. Giving this its own endpoint means a caller who wants to know "is
 * there an encoding?" asks that question directly, rather than reading a `status` field and
 * being expected to know it answers something else.
 */
export async function get_verse_encoding_availability({ db, references }: { db: D1DatabaseSession, references: Reference[] }): Promise<SourceEncodedResult[]> {
	const sql = `
		SELECT LENGTH(COALESCE(semantic_encoding, '')) > 0 AS has_encoding
		FROM Sources
		WHERE type LIKE ?
			AND id_primary LIKE ?
			AND id_secondary = ?
			AND id_tertiary = ?
	`

	const prepared_statement = db.prepare(sql)
	const bound_statements = references.map(({ type, id_primary, id_secondary, id_tertiary }) =>
		prepared_statement.bind(type, id_primary, id_secondary.toString(), id_tertiary.toString()),
	)

	const batch_result = await db.batch<{ has_encoding: number }>(bound_statements)

	return references.map((reference, i) => ({
		reference,
		has_encoding: Boolean(batch_result[i]?.results[0]?.has_encoding),
	}))
}
