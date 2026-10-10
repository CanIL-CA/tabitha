import { error, type RequestHandler } from '@sveltejs/kit'
import type { DbRowText } from '#lib/types.js'

type QueryBookResult = Pick<DbRowText, 'book'>

export async function GET({ locals: { db }, params: { project } }: Parameters<RequestHandler>[0]) {
	const sql = `
		SELECT DISTINCT book
		FROM Text
		WHERE project = ?
	`

	try {
		const { results } = await db.prepare(sql).bind(project).all<QueryBookResult>()

		return Response.json(results.map(({ book }) => book))
	} catch {
		return error(404, 'Not found')
	}
}
