import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { Reference } from '@tabitha/types'

const { get_source_data, get_secondary_ids, get_tertiary_ids, get_primary_ids } = vi.hoisted(() => ({
	get_source_data: vi.fn(),
	get_secondary_ids: vi.fn(),
	get_tertiary_ids: vi.fn(),
	get_primary_ids: vi.fn(),
}))

vi.mock('./read', () => ({
	get_source_data,
	get_secondary_ids,
	get_tertiary_ids,
	get_primary_ids,
}))

const { get_previous_reference, get_next_reference } = await import('./navigation')

const db = {} as D1DatabaseSession

beforeEach(() => {
	vi.clearAllMocks()
})

describe('get_previous_reference', () => {
	it('returns null when already at the very first verse of the Bible', async () => {
		const reference: Reference = { type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' }

		const result = await get_previous_reference({ db, reference })

		expect(result).toBeNull()
		expect(get_source_data).not.toHaveBeenCalled()
	})

	it("crosses a book boundary, landing on the previous book's last chapter and verse", async () => {
		get_secondary_ids.mockResolvedValueOnce([{ id_secondary: '1' }, { id_secondary: '4' }])
		get_tertiary_ids.mockResolvedValueOnce([{ id_tertiary: '1' }, { id_tertiary: '6' }])
		get_source_data.mockResolvedValueOnce({})

		const reference: Reference = { type: 'Bible', id_primary: 'Matthew', id_secondary: '1', id_tertiary: '1' }
		const result = await get_previous_reference({ db, reference })

		expect(result).toEqual({ type: 'Bible', id_primary: 'Malachi', id_secondary: '4', id_tertiary: '6' })
	})

	it('crosses a primary-id boundary for a non-Bible type, using get_primary_ids order', async () => {
		get_primary_ids.mockResolvedValueOnce([
			{ id_primary: 'Nouns' },
			{ id_primary: 'Verbs' },
			{ id_primary: 'Adjectives' },
		])
		get_secondary_ids.mockResolvedValueOnce([{ id_secondary: '1' }, { id_secondary: '3' }])
		get_tertiary_ids.mockResolvedValueOnce([{ id_tertiary: '1' }, { id_tertiary: '5' }])
		get_source_data.mockResolvedValueOnce({})

		const reference: Reference = { type: 'Grammar Introduction', id_primary: 'Verbs', id_secondary: '1', id_tertiary: '1' }
		const result = await get_previous_reference({ db, reference })

		expect(result).toEqual({ type: 'Grammar Introduction', id_primary: 'Nouns', id_secondary: '3', id_tertiary: '5' })
		expect(get_primary_ids).toHaveBeenCalledWith({ db, type: 'Grammar Introduction' })
	})
})

describe('get_next_reference', () => {
	it('returns null when already at the very last verse of the Bible', async () => {
		get_source_data.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

		const reference: Reference = { type: 'Bible', id_primary: 'Revelation', id_secondary: '22', id_tertiary: '21' }
		const result = await get_next_reference({ db, reference })

		expect(result).toBeNull()
		expect(get_source_data).toHaveBeenCalledTimes(2)
	})

	it('crosses the Old Testament / New Testament seam from Malachi into Matthew', async () => {
		get_source_data
			.mockResolvedValueOnce(null) // Malachi 4:7 doesn't exist
			.mockResolvedValueOnce(null) // Malachi 5:1 doesn't exist
			.mockResolvedValueOnce({}) // Matthew 1:1 exists

		const reference: Reference = { type: 'Bible', id_primary: 'Malachi', id_secondary: '4', id_tertiary: '6' }
		const result = await get_next_reference({ db, reference })

		expect(result).toEqual({ type: 'Bible', id_primary: 'Matthew', id_secondary: '1', id_tertiary: '1' })
	})

	it('crosses a primary-id boundary for a non-Bible type, using get_primary_ids order', async () => {
		get_source_data
			.mockResolvedValueOnce(null) // Nouns 3:6 doesn't exist
			.mockResolvedValueOnce(null) // Nouns 4:1 doesn't exist
			.mockResolvedValueOnce({}) // Verbs 1:1 exists
		get_primary_ids.mockResolvedValueOnce([
			{ id_primary: 'Nouns' },
			{ id_primary: 'Verbs' },
			{ id_primary: 'Adjectives' },
		])

		const reference: Reference = { type: 'Grammar Introduction', id_primary: 'Nouns', id_secondary: '3', id_tertiary: '5' }
		const result = await get_next_reference({ db, reference })

		expect(result).toEqual({ type: 'Grammar Introduction', id_primary: 'Verbs', id_secondary: '1', id_tertiary: '1' })
		expect(get_primary_ids).toHaveBeenCalledWith({ db, type: 'Grammar Introduction' })
	})
})
