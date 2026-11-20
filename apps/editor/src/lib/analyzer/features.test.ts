import { describe, expect, test } from 'vitest'
import { get_features_for_token } from './features'
import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'

describe('features', () => {
	test('get_features_for_token extracts default features', () => {
		const token = create_token({ token: 'write-01', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'write-01', part_of_speech: 'Verb', sense: 'A' })] })

		const features = get_features_for_token({ tokens: [token], token_index: 0, category: 'Verb' })
		expect(Array.isArray(features)).toBe(true)
	})
})
