import { error } from '@sveltejs/kit'
import { sync_complex_terms } from '#lib/server/complex_terms.js'
import type { RequestHandler } from './$types'

export async function POST({ locals }: Parameters<RequestHandler>[0]) {
	if (!locals.user) {
		throw error(401, 'Unauthorized')
	}

	try {
		const count = await sync_complex_terms(locals.db_ontology)
		return Response.json({
			success: true,
			count,
			timestamp: new Date().toISOString(),
		})
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		console.error('Failed to sync complex terms:', message)
		throw error(500, `Failed to sync complex terms: ${message}`)
	}
}
