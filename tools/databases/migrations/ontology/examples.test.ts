import { describe, expect, it } from 'bun:test'
import { examples_drop_problem, split_into_chunks } from './examples'

describe('split_into_chunks', () => {
	const INSERT = (value: string) => `INSERT INTO T VALUES('${value}');`
	const SQL = ['DROP TABLE IF EXISTS T;', 'CREATE TABLE T (a TEXT);', ...['a', 'b', 'c', 'd'].map(INSERT)].join('\n')

	it('keeps a small dump in one piece', () => {
		expect(split_into_chunks({ sql: SQL, max_bytes: 10_000 })).toEqual([SQL])
	})

	it('joins back into the original dump, however small the pieces', () => {
		const chunks = split_into_chunks({ sql: SQL, max_bytes: 1 })

		expect(chunks.join('\n')).toBe(SQL)
	})

	it('only cuts before an INSERT, so the CREATE TABLE stays with the first piece and each piece is whole statements', () => {
		const chunks = split_into_chunks({ sql: SQL, max_bytes: 1 })

		expect(chunks[0]).toContain('CREATE TABLE T')
		for (const chunk of chunks.slice(1)) expect(chunk.startsWith('INSERT INTO ')).toBe(true)
	})
})

describe('examples_drop_problem', () => {
	it('refuses a rebuild that produced no examples', () => {
		expect(examples_drop_problem({ live_count: 1000, rebuilt_count: 0 })).toMatch(/no examples/)
	})

	it('accepts a rebuild that grew or lost only a little', () => {
		expect(examples_drop_problem({ live_count: 1000, rebuilt_count: 1500 })).toBeNull()
		expect(examples_drop_problem({ live_count: 1000, rebuilt_count: 850 })).toBeNull()
	})

	it('refuses a rebuild that lost more than a fifth of the live examples, naming both counts', () => {
		const problem = examples_drop_problem({ live_count: 1000, rebuilt_count: 700 })

		expect(problem).toContain('30.0%')
		expect(problem).toContain('1,000')
		expect(problem).toContain('700')
	})

	it('accepts any non-empty rebuild when the live table has no examples yet', () => {
		expect(examples_drop_problem({ live_count: 0, rebuilt_count: 10 })).toBeNull()
	})
})
