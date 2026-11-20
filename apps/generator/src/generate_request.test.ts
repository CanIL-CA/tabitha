import { describe, expect, it } from 'vitest'
import { parse_generate_request } from './generate_request'

const RUTH_1_1 = { book: 8, chapter: 1, verse: 1, encoding: '~\\wd ~\\tg c-IDp00~\\lu {' }

describe('parse_generate_request', () => {
	it('fills in the defaults for a minimal request', () => {
		expect(parse_generate_request(RUTH_1_1)).toEqual({
			job: { ...RUTH_1_1, previous_encoding: '', audience: 1, segment: 'last' },
		})
	})

	it('keeps the optional fields a caller sends', () => {
		const body = { ...RUTH_1_1, previous_encoding: '~\\wd previous', audience: 3, segment: 'complex_concept_insertion' }

		expect(parse_generate_request(body)).toEqual({ job: body })
	})

	it.each([
		['no body', null],
		['a body that is not an object', 'Ruth 1:1'],
		['a missing verse', { ...RUTH_1_1, verse: undefined }],
		['a chapter of zero', { ...RUTH_1_1, chapter: 0 }],
		['a book given as text', { ...RUTH_1_1, book: 'Ruth' }],
		['a fractional verse', { ...RUTH_1_1, verse: 1.5 }],
		['a missing encoding', { ...RUTH_1_1, encoding: undefined }],
		['a blank encoding', { ...RUTH_1_1, encoding: '   ' }],
		['a previous encoding that is not text', { ...RUTH_1_1, previous_encoding: 7 }],
		['an audience outside 1 to 5', { ...RUTH_1_1, audience: 6 }],
		['an audience given as text', { ...RUTH_1_1, audience: '1' }],
		['an unknown segment', { ...RUTH_1_1, segment: 'first' }],
		['a segment named after an inherited property', { ...RUTH_1_1, segment: 'toString' }],
	])('rejects %s', (_case, body) => {
		const result = parse_generate_request(body)

		expect(result).not.toHaveProperty('job')
		expect(result).toHaveProperty('error')
	})
})
