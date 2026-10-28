import { describe, expect, it } from 'vitest'
import { combine_stem_senses, next_sense_after } from './stem_senses'
import type { StemSense } from '#lib/types.js'

const sense = ({ letter, status = 'in ontology' }: { letter: string, status?: StemSense['status'] }): StemSense =>
	({ sense: letter, gloss: `gloss ${letter}`, status })

describe('next_sense_after', () => {
	it('starts at A when the stem has no senses', () => {
		expect(next_sense_after([])).toBe('A')
	})

	it('takes the letter after the highest one in use, even with a gap', () => {
		expect(next_sense_after([sense({ letter: 'A' }), sense({ letter: 'C' })])).toBe('D')
	})
})

describe('combine_stem_senses', () => {
	it('sorts every sense by letter and counts pending ones when choosing the next sense', () => {
		const combined = combine_stem_senses({
			stem: 'test',
			server_senses: [sense({ letter: 'A' }), sense({ letter: 'B', status: 'suggested' })],
			unsynced_senses: [sense({ letter: 'C', status: 'unsynced' })],
		})

		expect(combined.senses.map(s => s.sense)).toEqual(['A', 'B', 'C'])
		expect(combined.next_sense).toBe('D')
		expect(combined.has_pending_create).toBe(true)
	})

	it('has no pending create when every sense is in the Ontology', () => {
		const combined = combine_stem_senses({ stem: 'test', server_senses: [sense({ letter: 'A' })], unsynced_senses: [] })

		expect(combined.has_pending_create).toBe(false)
		expect(combined.next_sense).toBe('B')
	})
})
