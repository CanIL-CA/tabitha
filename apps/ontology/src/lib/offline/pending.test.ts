import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedMutation } from './queue'
import { check_for_pending_change, check_for_pending_creates, merge_pending_changes } from './pending'
import type { Concept, ConceptUpdateData } from '#lib/types.js'

// IndexedDB is the storage boundary, so the queue's contents are faked in memory
const queue = vi.hoisted(() => ({ mutations: [] as QueuedMutation[] }))

vi.mock('./queue', () => ({
	get_all_mutations: async () => queue.mutations,
}))

function queue_holds(...mutations: QueuedMutation[]) {
	queue.mutations = mutations
}

beforeEach(() => {
	queue.mutations = []
})

const NOUN_KEY = { stem: 'baby', sense: 'A', part_of_speech: 'Noun' } as const

const NOUN_BODY: ConceptUpdateData = {
	...NOUN_KEY,
	level: '1',
	gloss: 'a very young child',
	brief_gloss: 'young child',
	categories: [],
	curated_examples: '',
}

function mutation({ client_id, action, body = NOUN_BODY }: {
	readonly client_id: string
	readonly action: QueuedMutation['action']
	readonly body?: ConceptUpdateData
}): QueuedMutation {
	return { client_id, action, body, status: 'pending', retry_count: 0 }
}

function concept({ stem = 'baby', sense = 'A', part_of_speech = 'Noun' as Concept['part_of_speech'] } = {}): Concept {
	return {
		id: `${stem}-${sense}-${part_of_speech}`,
		stem,
		sense,
		part_of_speech,
		level: '1',
		categorization: '',
		examples: '',
		gloss: 'a very young child',
		brief_gloss: 'young child',
		occurrences: 0,
		categories: [],
		curated_examples: [],
		curated_examples_raw: '',
		status: 'in ontology',
		how_to_hints: [],
		pending_changes: [],
	}
}

describe('merge_pending_changes', () => {
	it('returns the concepts untouched when nothing is queued', async () => {
		queue_holds()
		const concepts = [concept()]

		expect(await merge_pending_changes(concepts)).toEqual(concepts)
	})

	it('returns the concepts untouched when only creates are queued', async () => {
		queue_holds(mutation({ client_id: 'a', action: 'create' }))
		const concepts = [concept()]

		expect(await merge_pending_changes(concepts)).toEqual(concepts)
	})

	it('adds an unsynced change holding only the edited fields to the matching concept', async () => {
		const edit = { ...NOUN_BODY, gloss: 'an infant' }
		queue_holds(mutation({ client_id: 'a', action: 'update', body: edit }))

		const [merged] = await merge_pending_changes([concept()])

		expect(merged.pending_changes).toHaveLength(1)
		expect(merged.pending_changes[0]).toMatchObject({
			id: -1,
			concept: NOUN_KEY,
			action: 'update',
			data: { gloss: { old: 'a very young child', value: 'an infant' } },
			suggested_by: null,
			approved_by: null,
			applied_date: null,
			version: null,
			is_unsynced: true,
		})
	})

	it('keeps the changes the server already reported', async () => {
		queue_holds(mutation({ client_id: 'a', action: 'update', body: { ...NOUN_BODY, level: '2' } }))
		const server_change = { id: 4, concept: NOUN_KEY, data: {}, action: 'update', suggested_by: null, approved_by: null, applied_date: null, version: null } as const
		const with_server_change = { ...concept(), pending_changes: [server_change] }

		const [merged] = await merge_pending_changes([with_server_change])

		expect(merged.pending_changes.map(change => change.id)).toEqual([4, -1])
	})

	it('leaves concepts without a queued edit as they were', async () => {
		queue_holds(mutation({ client_id: 'a', action: 'update', body: { ...NOUN_BODY, level: '2' } }))
		const other = concept({ stem: 'child' })

		const merged = await merge_pending_changes([concept(), other])

		expect(merged[1]).toEqual(other)
	})

	it('does not match a concept that differs in sense or part of speech', async () => {
		queue_holds(mutation({ client_id: 'a', action: 'update' }))
		const other_sense = concept({ sense: 'B' })
		const other_pos = concept({ part_of_speech: 'Verb' })

		const merged = await merge_pending_changes([other_sense, other_pos])

		expect(merged).toEqual([other_sense, other_pos])
	})
})

describe('check_for_pending_change', () => {
	it('finds the queued update for a concept', async () => {
		const update = mutation({ client_id: 'a', action: 'update' })
		queue_holds(mutation({ client_id: 'x', action: 'update', body: { ...NOUN_BODY, stem: 'child' } }), update)

		expect(await check_for_pending_change(NOUN_KEY)).toEqual(update)
	})

	it('ignores a queued create for the same concept', async () => {
		queue_holds(mutation({ client_id: 'a', action: 'create' }))

		expect(await check_for_pending_change(NOUN_KEY)).toBeUndefined()
	})

	it('returns undefined when the concept has nothing queued', async () => {
		queue_holds()

		expect(await check_for_pending_change(NOUN_KEY)).toBeUndefined()
	})
})

describe('check_for_pending_creates', () => {
	it('turns each queued create into an unsynced change with all its fields as new values', async () => {
		queue_holds(
			mutation({ client_id: 'a', action: 'create' }),
			mutation({ client_id: 'b', action: 'update' }),
		)

		const changes = await check_for_pending_creates()

		expect(changes).toHaveLength(1)
		expect(changes[0]).toMatchObject({
			id: -1,
			concept: NOUN_KEY,
			action: 'create',
			is_unsynced: true,
			data: {
				level: { value: '1' },
				gloss: { value: 'a very young child' },
				brief_gloss: { value: 'young child' },
				categories: { value: [] },
			},
		})
	})

	it('returns nothing when no creates are queued', async () => {
		queue_holds(mutation({ client_id: 'b', action: 'update' }))

		expect(await check_for_pending_creates()).toEqual([])
	})
})
