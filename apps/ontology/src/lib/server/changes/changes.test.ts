import { describe, expect, it, vi } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import type { OntologyChange, ConceptCreateData, OntologyUser } from '$lib/types'

vi.mock('./concepts', () => ({
	create_concept: vi.fn().mockResolvedValue(undefined),
	update_concept: vi.fn().mockResolvedValue(undefined),
	get_concept_for_update: vi.fn().mockResolvedValue({
		stem: 'love',
		sense: 'A',
		part_of_speech: 'Verb',
		level: '1',
		gloss: 'old gloss',
		brief_gloss: '',
		categories: [],
		curated_examples: '',
	}),
}))

const { apply_change_directly, suggest_change, approve_change, can_approve_change } = await import('./changes')
const { create_concept } = await import('./concepts')

type QueuedResponse = { first?: unknown, all?: unknown[], run?: { last_row_id?: number } }

// Fakes just enough of D1Database to drive changes.ts's own queries. Callers queue responses in
// the order changes.ts issues them.
function make_db(responses: QueuedResponse[] = []) {
	const statements: { bind: ReturnType<typeof vi.fn> }[] = []

	const prepare = vi.fn(() => {
		const response = responses[statements.length] ?? {}
		const result = {
			first: vi.fn().mockResolvedValue(response.first ?? null),
			all: vi.fn().mockResolvedValue({ results: response.all ?? [] }),
			run: vi.fn().mockResolvedValue({ meta: { last_row_id: response.run?.last_row_id } }),
		}
		const bind = vi.fn().mockReturnValue(result)
		statements.push({ bind })
		return { ...result, bind }
	})

	return { db: { prepare } as unknown as D1Database, statements }
}

function make_change(overrides: Partial<OntologyChange> = {}): OntologyChange {
	return {
		id: 1,
		concept: { stem: 'love', sense: 'A', part_of_speech: 'Verb' },
		data: {},
		action: 'create',
		suggested_by: null,
		approved_by: null,
		applied_date: null,
		version: null,
		...overrides,
	}
}

const user: OntologyUser = {
	id: 1,
	email: 'user@example.com',
	name: 'user',
	permissions: {
		has_protected_access: true,
		can_add: false,
		can_update: false,
	},
}

describe('can_approve_change', () => {
	it('returns false for a change that was never suggested (applied directly by an authorized user)', () => {
		const change = make_change({ suggested_by: null, approved_by: { name: 'x', date: new Date() } })
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: true } })).toBe(false)
	})

	it('returns false once a suggestion is already approved', () => {
		const change = make_change({
			suggested_by: { name: 'suggester', date: new Date() },
			approved_by: { name: 'approver', date: new Date() },
		})
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: true } })).toBe(false)
	})

	it("requires can_add for a 'create' suggestion", () => {
		const change = make_change({ action: 'create', suggested_by: { name: 'a', date: new Date() } })
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: false } })).toBe(true)
		expect(can_approve_change({ change, permissions: { can_add: false, can_update: true } })).toBe(false)
	})

	it("requires can_update for an 'update' suggestion", () => {
		const change = make_change({ action: 'update', suggested_by: { name: 'a', date: new Date() } })
		expect(can_approve_change({ change, permissions: { can_add: false, can_update: true } })).toBe(true)
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: false } })).toBe(false)
	})
})

describe('suggest_change', () => {
	const create_data: ConceptCreateData = {
		stem: 'peace',
		sense: 'A',
		part_of_speech: 'Noun',
		level: '1',
		gloss: 'a state of calm',
		brief_gloss: '',
		categories: [],
		curated_examples: '',
	}

	it('records a suggestion, and does not apply it, when the user lacks permission', async () => {
		const { db, statements } = make_db()

		const applied = await suggest_change({ db, action: 'create', data: create_data, user })

		expect(applied).toBe(false)
		expect(create_concept).not.toHaveBeenCalled()
		expect(statements).toHaveLength(1)
		expect(statements[0].bind).toHaveBeenCalledWith('peace', 'A', 'Noun', expect.any(String), 'create', user.id, expect.any(String))
	})
})

describe('apply_change_directly', () => {
	const create_data: ConceptCreateData = {
		stem: 'peace',
		sense: 'A',
		part_of_speech: 'Noun',
		level: '1',
		gloss: 'a state of calm',
		brief_gloss: '',
		categories: [],
		curated_examples: '',
	}

	it('applies immediately when the user is authorized', async () => {
		const { db } = make_db([
			{ run: { last_row_id: 42 } }, // the initial INSERT
			{ first: '3.0.9500' }, // get_next_version's SELECT
			{}, // apply_one_change's UPDATE after a successful create_concept
		])

		const applied = await apply_change_directly({ db, action: 'create', data: create_data, user })

		expect(applied).toBe(true)
		expect(create_concept).toHaveBeenCalledWith({ db, data: expect.objectContaining({ stem: 'peace', gloss: 'a state of calm' }) })
	})
})

describe('approve_change', () => {
	it('records the approving user on the change', async () => {
		const { db, statements } = make_db([
			{}, // the UPDATE that records the approval
			{
				first: {
					id: 1,
					concept_stem: 'love',
					concept_sense: 'A',
					concept_part_of_speech: 'Verb',
					data: '{}',
					action: 'update',
					suggested_by_id: 2,
					suggested_date: new Date().toISOString(),
					approved_by_id: user.id,
					approved_date: new Date().toISOString(),
					applied_date: null,
					version: null,
				},
			}, // get_change's re-fetch
		])

		const updated = await approve_change({ db, id: 1, user })

		expect(statements[0].bind).toHaveBeenCalledWith(user.id, expect.any(String), 1)
		expect(updated.approved_by?.id).toBe(user.id)
		expect(updated.applied_date).toBeNull()
	})
})
