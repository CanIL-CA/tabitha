import { json } from '@sveltejs/kit'
import type { RequestEvent } from './$types'
import { sync_in_progress_phase_1 } from '$lib/server/phase_1_scraping'

export async function GET({ locals: { db } }: RequestEvent) {
	// const book = searchParams.get('book') ?? 'Jeremiah'
	// const chapter = Number(searchParams.get('chapter') || 1)
	// const verse = Number(searchParams.get('verse') || 1)

	sync_in_progress_phase_1(db)
	return json({ triggered: true })
}