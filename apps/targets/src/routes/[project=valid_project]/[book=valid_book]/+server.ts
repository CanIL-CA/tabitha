import { error, type RequestHandler } from '@sveltejs/kit'
import type { DbRowText } from '#lib/types.js'

type QueryChapterResult = Pick<DbRowText, 'chapter'>

export async function GET({ locals: { db }, params: { project, book } }: Parameters<RequestHandler>[0]) {
	const sql = `
		SELECT DISTINCT chapter
		FROM Text
		WHERE project = ? AND book = ?
		ORDER BY chapter
	`
	const { results } = await db.prepare(sql).bind(project, book).all<QueryChapterResult>()

	if (results.length) {
		return Response.json(results.map(({ chapter }) => chapter.toString()))
	}

	return error(404, 'Not found')
}
