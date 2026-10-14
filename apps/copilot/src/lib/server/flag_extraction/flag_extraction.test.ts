import { describe, expect, test } from 'vitest'
import { extract_flags } from './flag_extraction'
import type { CopilotEncodingEntity } from '#lib/types.js'

describe('extract_flags', () => {
	test('returns no flags for an empty encoding', () => {
		expect(extract_flags([])).toEqual([])
	})

	test('flags a verb feature, anchored at the verb\'s position in the tree', () => {
		const encoding: CopilotEncodingEntity[] = [
			{ category: 'Clause', children: [{ category: 'Noun', concept: 'Paul' }, { category: 'Verb', concept: 'write-01', features: { Time: 'Historic Past' } }] },
		]

		const flags = extract_flags(encoding)

		expect(flags).toHaveLength(1)
		expect(flags[0]).toMatchObject({ name: 'Verb Time', value: 'Historic Past', weight: -1 })
		expect(flags[0].encoding_anchor).toMatchObject({ node_id: '0.1', category: 'Verb' })
	})

	test('gives each feature its own flag', () => {
		const encoding: CopilotEncodingEntity[] = [
			{ category: 'Verb', concept: 'go-01', features: { Time: 'Yesterday', Polarity: 'Negative' } },
		]

		const names = extract_flags(encoding).map(flag => `${flag.name}=${flag.value}`)

		expect(names).toEqual(expect.arrayContaining(['Verb Time=Yesterday', 'Verb Polarity=Negative']))
		expect(names).toHaveLength(2)
	})

	test('ignores a feature the rules do not cover', () => {
		expect(extract_flags([{ category: 'Verb', concept: 'go-01', features: { Unrecognized: 'Whatever' } }])).toEqual([])
	})

	test('fills a value template from the bound variables', () => {
		const encoding: CopilotEncodingEntity[] = [{
			category: 'Noun Phrase',
			children: [
				{ category: 'Noun', concept: 'Abraham' },
				{ category: 'Noun Phrase', features: { Implicit: 'Explanation of Name' }, children: [{ category: 'Noun', concept: 'man' }] },
			],
		}]

		const flag = extract_flags(encoding).find(({ name }) => name === 'Explanation of Name')

		expect(flag?.value).toBe('man named Abraham')
		expect(flag?.encoding_anchor['node_id']).toBe('0.1')
	})
})
