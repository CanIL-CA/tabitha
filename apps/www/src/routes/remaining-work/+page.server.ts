import { PUBLIC_SOURCES_API_HOST } from '$env/static/public'
import { create_sources_client } from '@tabitha/api-client'
import type { SourceStatus } from '@tabitha/types'

export const prerender = false

const STATUS_ORDER: SourceStatus[] = [
	'Ready to Translate',
	'Final Review in Progress',
	'Initial Analysis Complete',
	'Initial Analysis in Progress',
	'Not Started',
]

export async function load({ fetch }) {
	const sources = create_sources_client({ base_url: PUBLIC_SOURCES_API_HOST, fetch })
	const book_statuses = await sources.get_all_book_statuses('Bible').catch(() => [])

	const counts = new Map<SourceStatus, number>(STATUS_ORDER.map(status => [status, 0]))
	for (const { status } of book_statuses) {
		counts.set(status, (counts.get(status) ?? 0) + 1)
	}

	return {
		total_books: book_statuses.length,
		status_counts: STATUS_ORDER.map(status => ({ status, count: counts.get(status) ?? 0 })),
	}
}
