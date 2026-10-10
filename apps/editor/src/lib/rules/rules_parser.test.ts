import { describe, expect, test } from 'vitest'
import { TOKEN_TYPE, create_token } from '../token'
import { create_context_filter, create_token_filter, create_token_transform } from './rules_parser'
import type { ContextFilterResult, TokenFilterJson } from '#lib/rules/types.js'

function matched_context_indexes(result: ContextFilterResult): number[] {
	if (!result.success) throw new Error('expected the context filter to match')
	return result.context_indexes
}

describe('token filters', () => {
	test('all', () => {
		const filter_json = 'all'
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
		]
		const results = tokens.map(token => filter(token))
		expect(results.every(result => result)).toBe(true)
	})
	test('by token', () => {
		const filter_json = { 'token': 'text' }
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: ['text'] }),
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: ['text-A'] }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: ['token'] }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: ['text'] }),
		]
		const results = tokens.map(token => filter(token))

		expect(results[0]).toBe(true)
		expect(results[1]).toBe(true)
		expect(results[2]).toBe(false)
		expect(results[3]).toBe(false)
	})
	test('by multiple tokens', () => {
		const filter_json = { 'token': 'text|other' }
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map(token => filter(token))

		expect(results[0]).toBe(true)
		expect(results[1]).toBe(true)
		expect(results[2]).toBe(false)
	})
	test('by tag key', () => {
		const filter_json = { 'tag': 'key1|key2'  }
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: {} }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': '' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key2': '' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key2': 'value', 'other_key': 'value' } }),
		]
		const results = tokens.map(token => filter(token))

		expect(results[0]).toBe(false)
		expect(results[1]).toBe(false)
		expect(results[2]).toBe(false)
		expect(results[3]).toBe(true)
		expect(results[4]).toBe(false)
		expect(results[5]).toBe(true)
	})
	test('by tag value', () => {
		const filter_json = { 'tag': { 'key': 'tag1|tag2' } }
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: {} }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'other_key': 'tag1' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key': 'tag1' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key': 'tag2' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key': 'tag3' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key': 'tag2|tag3' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key': 'tag4|tag4' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key': 'tag1', 'other_key': 'tag1' } }),
		]
		const results = tokens.map(token => filter(token))

		expect(results[0]).toBe(false)
		expect(results[1]).toBe(false)
		expect(results[2]).toBe(true)
		expect(results[3]).toBe(true)
		expect(results[4]).toBe(false)
		expect(results[5]).toBe(true)
		expect(results[6]).toBe(false)
		expect(results[7]).toBe(true)
	})
	test('by multiple tag values', () => {
		const filter_json = { 'tag': { 'key1': 'value1', 'key2': 'value2' } }
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: {} }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'not_value', 'key2': 'value2' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'key2': 'value2', 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1|value3', 'key2': 'value4|value2' } }),
		]
		const results = tokens.map(token => filter(token))

		expect(results[0]).toBe(false)
		expect(results[1]).toBe(false)
		expect(results[2]).toBe(false)
		expect(results[3]).toBe(false)
		expect(results[4]).toBe(true)
		expect(results[5]).toBe(true)
	})
	test('by multiple tag options', () => {
		const filter_json: TokenFilterJson = { 'tag': [{ 'key1': 'value1' }, { 'key2': 'value2' }] }
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: {} }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'not_value', 'key2': 'value2' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'key2': 'value2', 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1|value3', 'key2': 'value4|value2' } }),
		]
		const results = tokens.map(token => filter(token))

		expect(results[0]).toBe(false)
		expect(results[1]).toBe(false)
		expect(results[2]).toBe(true)
		expect(results[3]).toBe(true)
		expect(results[4]).toBe(true)
		expect(results[5]).toBe(true)
	})
	test('by anded tag options', () => {
		const filter_json: TokenFilterJson = { 'tag': [{ 'key1': 'value1&value3' }] }
		const filter = create_token_filter(filter_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: {} }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'not_value', 'key2': 'value2' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'other_key': 'value' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1|value3', 'key2': 'value4|value2' } }),
		]
		const results = tokens.map(token => filter(token))

		expect(results[0]).toBe(false)
		expect(results[1]).toBe(false)
		expect(results[2]).toBe(false)
		expect(results[3]).toBe(false)
		expect(results[4]).toBe(true)
	})
})

describe('context filters', () => {
	test('empty filter results in true', () => {
		const context_json = { }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results.every(result => result.success)).toBe(true)
	})
	test('empty filter results in true', () => {
		const context_json = { 'followedby': { } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results.some(result => result.success)).toBe(true)
	})
	test('followed by', () => {
		const context_json = { 'followedby': { 'token': 'other' } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(false)
		expect(results[1].success).toBe(true)
		expect(matched_context_indexes(results[1])[0]).toBe(2)
		expect(results[2].success).toBe(false)
	})
	test('not followed by', () => {
		const context_json = { 'notfollowedby': { 'token': 'token' } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(true)
		expect(results[1].success).toBe(false)
		expect(results[2].success).toBe(true)
		expect(results[3].success).toBe(true)
	})
	test('followed by with skip', () => {
		const context_json = { 'followedby': { 'token': 'other', 'skip': { 'token': 'skip' } } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'last', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(true)
		expect(matched_context_indexes(results[0])[0]).toBe(2)
		expect(results[1].success).toBe(true)
		expect(matched_context_indexes(results[1])[0]).toBe(2)
		expect(results[2].success).toBe(false)
		expect(results[3].success).toBe(false)
	})
	test('followed by with multiple skips', () => {
		const context_json = { 'followedby': { 'token': 'other', 'skip': [{ 'token': 'skip' }, { 'tag': { 'skip': 'skip' } }] } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'notskip', type: TOKEN_TYPE.LOOKUP_WORD, tag:  { 'skip': 'skip' } }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'last', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(true)
		expect(matched_context_indexes(results[0])[0]).toBe(3)
		expect(results[1].success).toBe(true)
		expect(matched_context_indexes(results[1])[0]).toBe(3)
		expect(results[2].success).toBe(true)
		expect(matched_context_indexes(results[2])[0]).toBe(3)
		expect(results[3].success).toBe(false)
		expect(results[4].success).toBe(false)
	})
	test('preceded by', () => {
		const context_json = { 'precededby': { 'token': 'token' } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(false)
		expect(results[1].success).toBe(true)
		expect(matched_context_indexes(results[1])[0]).toBe(0)
		expect(results[2].success).toBe(false)
		expect(results[3].success).toBe(true)
		expect(matched_context_indexes(results[3])[0]).toBe(2)
	})
	test('not preceded by', () => {
		const context_json = { 'notprecededby': { 'token': 'token' } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(true)
		expect(results[1].success).toBe(false)
		expect(results[2].success).toBe(true)
		expect(results[3].success).toBe(false)
	})
	test('preceded by with skip', () => {
		const context_json = { 'precededby': { 'token': 'token', 'skip': { 'token': 'skip' } } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'last', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(false)
		expect(results[1].success).toBe(true)
		expect(matched_context_indexes(results[1])[0]).toBe(0)
		expect(results[2].success).toBe(true)
		expect(matched_context_indexes(results[2])[0]).toBe(1)
		expect(results[3].success).toBe(true)
		expect(matched_context_indexes(results[3])[0]).toBe(1)
		expect(results[4].success).toBe(false)
	})
	test('preceded by and followed by', () => {
		const context_json = { 'precededby': { 'token': 'token' }, 'followedby': { 'token': 'token' } }
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'middle', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'last', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(false)
		expect(results[1].success).toBe(false)
		expect(results[2].success).toBe(true)
		expect(matched_context_indexes(results[2])[0]).toBe(1)
		expect(matched_context_indexes(results[2])[1]).toBe(3)
		expect(results[3].success).toBe(false)
		expect(results[4].success).toBe(false)
		expect(results[5].success).toBe(false)
	})
	test('preceded by and followed by with skip', () => {
		const context_json = {
			'precededby': {
				'token': 'token',
				'skip': { 'token': 'skip|middle' },
			},
			'followedby': {
				'token': 'token',
				'skip': { 'token': 'skip|middle' },
			},
		}
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'middle', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(false)
		expect(results[1].success).toBe(false)
		expect(results[2].success).toBe(true)
		expect(matched_context_indexes(results[2])[0]).toBe(1)
		expect(matched_context_indexes(results[2])[1]).toBe(5)
		expect(results[3].success).toBe(true)
		expect(matched_context_indexes(results[3])[0]).toBe(1)
		expect(matched_context_indexes(results[3])[1]).toBe(5)
		expect(results[4].success).toBe(true)
		expect(matched_context_indexes(results[4])[0]).toBe(1)
		expect(matched_context_indexes(results[4])[1]).toBe(5)
		expect(results[5].success).toBe(false)
		expect(results[6].success).toBe(false)
	})
	test('precededby array', () => {
		const context_json = {
			'precededby': [
				{
					'token': 'token',
					'skip': { 'token': 'skip' },
				},
				{
					'token': 'middle',
					'skip': { 'token': 'skip' },
				},
			],
		}
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'middle', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(false)
		expect(results[1].success).toBe(false)
		expect(results[2].success).toBe(false)
		expect(results[3].success).toBe(false)
		expect(results[4].success).toBe(true)
		expect(matched_context_indexes(results[4])[0]).toBe(1)
		expect(matched_context_indexes(results[4])[1]).toBe(3)
		expect(results[5].success).toBe(true)
		expect(matched_context_indexes(results[5])[0]).toBe(1)
		expect(matched_context_indexes(results[5])[1]).toBe(3)
		expect(results[6].success).toBe(false)
	})
	test('followedby array', () => {
		const context_json = {
			'followedby': [
				{
					'token': 'middle',
					'skip': { 'token': 'skip' },
				},
				{
					'token': 'token',
					'skip': { 'token': 'skip' },
				},
			],
		}
		const filter = create_context_filter(context_json)

		const tokens = [
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'middle', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'skip', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
		]
		const results = tokens.map((_, i) => filter(tokens, i))

		expect(results[0].success).toBe(false)
		expect(results[1].success).toBe(true)
		expect(matched_context_indexes(results[1])[0]).toBe(3)
		expect(matched_context_indexes(results[1])[1]).toBe(5)
		expect(results[2].success).toBe(true)
		expect(matched_context_indexes(results[2])[0]).toBe(3)
		expect(matched_context_indexes(results[2])[1]).toBe(5)
		expect(results[3].success).toBe(false)
		expect(results[4].success).toBe(false)
		expect(results[5].success).toBe(false)
		expect(results[6].success).toBe(false)
	})
})

describe('token transforms', () => {
	test('type', () => {
		const transform_json = { 'type': TOKEN_TYPE.FUNCTION_WORD }
		const transform = create_token_transform(transform_json)

		const token = create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD })
		const result = transform(token)
		expect(result.token).toBe(token.token)
		expect(result.type).toBe(TOKEN_TYPE.FUNCTION_WORD)
		expect(result.lookup_terms).toEqual(token.lookup_terms)
		expect(result.messages).toEqual(token.messages)
	})
	test('tag with existing tag on token', () => {
		const transform_json = { 'type': TOKEN_TYPE.FUNCTION_WORD, 'tag': { 'key': 'value' } }
		const transform = create_token_transform(transform_json)

		const token = create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD, tag: { 'old_key': 'old_value' } })
		const result = transform(token)
		expect(result.token).toBe(token.token)
		expect(result.type).toBe(TOKEN_TYPE.FUNCTION_WORD)
		expect(result.tag).toEqual({ 'key': 'value', 'old_key': 'old_value' })
		expect(result.messages).toEqual(token.messages)
	})
	test('tag gets overwritten', () => {
		const transform_json = { 'type': TOKEN_TYPE.FUNCTION_WORD, 'tag': { 'key': 'value' } }
		const transform = create_token_transform(transform_json)

		const token = create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD, tag: { 'key': 'old_value' } })
		const result = transform(token)
		expect(result.token).toBe(token.token)
		expect(result.type).toBe(TOKEN_TYPE.FUNCTION_WORD)
		expect(result.tag).toEqual({ 'key': 'value' })
		expect(result.messages).toEqual(token.messages)
	})
	test('remove tag', () => {
		const transform_json = { 'remove_tag': 'key1' }
		const transform = create_token_transform(transform_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'key2': 'value2' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key2': 'value2' } }),
		]
		const results = tokens.map(transform)

		expect(results[0].tag).toEqual({ 'key2': 'value2' })
		expect(results[1].tag).toEqual({ 'key2': 'value2' })
	})
	test('remove multiple tags', () => {
		const transform_json = { 'remove_tag': ['key1', 'key2'] }
		const transform = create_token_transform(transform_json)

		const tokens = [
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'key2': 'value2' } }),
			create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key2': 'value2', 'key3': 'value3' } }),
		]
		const results = tokens.map(transform)

		expect(results[0].tag).toEqual({ })
		expect(results[1].tag).toEqual({ 'key3': 'value3' })
	})
	test('add and remove tag', () => {
		const transform_json = { 'tag': { 'key5': 'value5' }, 'remove_tag': 'key1' }
		const transform = create_token_transform(transform_json)

		const token = create_token({ token: 'token', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'key1': 'value1', 'key2': 'value2' } })
		const result = transform(token)

		expect(result.tag).toEqual({ 'key2': 'value2', 'key5': 'value5' })
	})
	test('type and tag', () => {
		const transform_json = { 'type': TOKEN_TYPE.FUNCTION_WORD, 'tag': { 'key': 'value' } }
		const transform = create_token_transform(transform_json)

		const token = create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD })
		const result = transform(token)
		expect(result.token).toBe(token.token)
		expect(result.type).toBe(TOKEN_TYPE.FUNCTION_WORD)
		expect(result.tag).toEqual({ 'key': 'value' })
		expect(result.messages).toEqual(token.messages)
	})
})