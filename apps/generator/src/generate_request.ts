import { SEGMENTS, type Segment } from './engine'

export type GenerateJob = {
	book: number
	chapter: number
	verse: number
	encoding: string
	previous_encoding: string
	audience: number
	segment: Segment
}

type ParseResult = { job: GenerateJob } | { error: string }

const AUDIENCES = [1, 2, 3, 4]

function is_positive_integer(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0
}

function is_segment(value: unknown): value is Segment {
	return typeof value === 'string' && Object.hasOwn(SEGMENTS, value)
}

export function parse_generate_request(body: unknown): ParseResult {
	if (typeof body !== 'object' || body === null) return { error: 'Expected a JSON object' }
	const { book, chapter, verse, encoding, previous_encoding = '', audience = 1, segment = 'last' } = body as Record<string, unknown>

	if (!is_positive_integer(book) || !is_positive_integer(chapter) || !is_positive_integer(verse)) return { error: 'book, chapter and verse must be positive integers' }
	if (typeof encoding !== 'string' || encoding.trim() === '') return { error: 'encoding must be a non-empty string' }
	if (typeof previous_encoding !== 'string') return { error: 'previous_encoding must be a string' }
	if (!AUDIENCES.includes(audience as number)) return { error: `audience must be one of ${AUDIENCES.join(', ')}` }
	if (!is_segment(segment)) return { error: `segment must be one of ${Object.keys(SEGMENTS).join(', ')}` }

	return { job: { book, chapter, verse, encoding, previous_encoding, audience: audience as number, segment } }
}
