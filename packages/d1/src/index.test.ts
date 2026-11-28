import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_D1_TIMEOUT_MS, with_timeout } from './index'

const NEVER = new Promise<never>(() => {})

type Respond = (query: { sql: string, values: unknown[] }) => Promise<unknown>

type FakeD1Options = {
	readonly respond?: Respond
	readonly session_bookmark?: string
}

// Stands in for the D1 binding at its boundary. Like the real one, batch() rejects statements it
// didn't create, and private class fields make a Proxy around an instance unusable as `this`.
class FakeStatement {
	readonly #sql: string
	readonly #values: unknown[]
	readonly #respond: Respond

	constructor({ sql, values, respond }: { sql: string, values: unknown[], respond: Respond }) {
		this.#sql = sql
		this.#values = values
		this.#respond = respond
	}

	bind(...values: unknown[]) {
		return new FakeStatement({ sql: this.#sql, values, respond: this.#respond })
	}

	all() {
		return this.#respond({ sql: this.#sql, values: this.#values })
	}

	first() {
		return this.#respond({ sql: this.#sql, values: this.#values })
	}

	run() {
		return this.#respond({ sql: this.#sql, values: this.#values })
	}

	raw() {
		return this.#respond({ sql: this.#sql, values: this.#values })
	}

	describe() {
		return `${this.#sql} ${JSON.stringify(this.#values)}`
	}
}

class FakeD1 {
	readonly #respond: Respond
	readonly #session_bookmark: string

	constructor({ respond = async query => query, session_bookmark = 'bookmark-1' }: FakeD1Options) {
		this.#respond = respond
		this.#session_bookmark = session_bookmark
	}

	prepare(sql: string) {
		return new FakeStatement({ sql, values: [], respond: this.#respond })
	}

	batch(statements: unknown[]) {
		if (!statements.every(statement => statement instanceof FakeStatement)) {
			return Promise.reject(new TypeError('batch() received a statement it did not create'))
		}

		return Promise.all(statements.map(statement => (statement as FakeStatement).all()))
	}

	exec(sql: string) {
		return this.#respond({ sql, values: [] })
	}

	withSession() {
		const bookmark = this.#session_bookmark
		return Object.assign(new FakeD1({ respond: this.#respond }), { getBookmark: () => bookmark })
	}
}

function fake_d1(options: FakeD1Options = {}): D1Database {
	return new FakeD1(options) as unknown as D1Database
}

describe('with_timeout', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('returns what the query returns when it settles in time', async () => {
		const db = with_timeout({ db: fake_d1() })

		const result = await db.prepare('SELECT * FROM Concepts WHERE stem = ?').bind('love').all()

		expect(result).toEqual({ sql: 'SELECT * FROM Concepts WHERE stem = ?', values: ['love'] })
	})

	it('passes through the error of a query that fails in time', async () => {
		const db = with_timeout({ db: fake_d1({ respond: () => Promise.reject(new Error('no such table: Concepts')) }) })

		await expect(db.prepare('SELECT * FROM Concepts').first()).rejects.toThrow('no such table: Concepts')
	})

	const QUERY_METHODS: Record<string, (statement: D1PreparedStatement) => Promise<unknown>> = {
		first: statement => statement.first(),
		all: statement => statement.all(),
		run: statement => statement.run(),
		raw: statement => statement.raw(),
	}

	it.each(Object.keys(QUERY_METHODS))('rejects %s() that outlasts the default timeout, naming the query', async method => {
		const db = with_timeout({ db: fake_d1({ respond: () => NEVER }) })

		const query = QUERY_METHODS[method](db.prepare('SELECT version FROM Version').bind())
		vi.advanceTimersByTime(DEFAULT_D1_TIMEOUT_MS)

		await expect(query).rejects.toThrow(`D1 query timed out after ${DEFAULT_D1_TIMEOUT_MS} ms: SELECT version FROM Version`)
	})

	it('keeps waiting until the timeout is reached', async () => {
		let settle: (value: unknown) => void = () => {}
		const db = with_timeout({ db: fake_d1({ respond: () => new Promise(resolve => { settle = resolve }) }), timeout_ms: 1_000 })

		const query = db.prepare('SELECT 1').first()
		vi.advanceTimersByTime(999)
		settle('late but in time')

		await expect(query).resolves.toBe('late but in time')
	})

	it('honors a custom timeout', async () => {
		const db = with_timeout({ db: fake_d1({ respond: () => NEVER }), timeout_ms: 60_000 })

		const query = db.prepare('SELECT 1').first()
		vi.advanceTimersByTime(60_000)

		await expect(query).rejects.toThrow('timed out after 60000 ms')
	})

	it('collapses whitespace in the query named by the timeout error', async () => {
		const db = with_timeout({ db: fake_d1({ respond: () => NEVER }) })

		const query = db.prepare(`
			SELECT *
			FROM Concepts
		`).all()
		vi.advanceTimersByTime(DEFAULT_D1_TIMEOUT_MS)

		await expect(query).rejects.toThrow(/: SELECT \* FROM Concepts$/)
	})

	it('runs a batch of its own prepared statements', async () => {
		const db = with_timeout({ db: fake_d1() })

		const results = await db.batch([
			db.prepare('UPDATE Concepts SET gloss = ? WHERE id = ?').bind('to love', 1),
			db.prepare('DELETE FROM Changes WHERE id = ?').bind(7),
		])

		expect(results).toEqual([
			{ sql: 'UPDATE Concepts SET gloss = ? WHERE id = ?', values: ['to love', 1] },
			{ sql: 'DELETE FROM Changes WHERE id = ?', values: [7] },
		])
	})

	it('rejects a batch that outlasts the timeout', async () => {
		const db = with_timeout({ db: fake_d1({ respond: () => NEVER }) })

		const batch = db.batch([db.prepare('SELECT 1'), db.prepare('SELECT 2')])
		vi.advanceTimersByTime(DEFAULT_D1_TIMEOUT_MS)

		await expect(batch).rejects.toThrow('timed out after 15000 ms: batch of 2 statements')
	})

	it('rejects exec() that outlasts the timeout', async () => {
		const db = with_timeout({ db: fake_d1({ respond: () => NEVER }) })

		const exec = db.exec('PRAGMA optimize')
		vi.advanceTimersByTime(DEFAULT_D1_TIMEOUT_MS)

		await expect(exec).rejects.toThrow('timed out after 15000 ms: PRAGMA optimize')
	})

	it('applies the timeout to a session started from a wrapped database', async () => {
		const db = with_timeout({ db: fake_d1({ respond: () => NEVER }), timeout_ms: 2_000 })

		const query = db.withSession().prepare('SELECT 1').first()
		vi.advanceTimersByTime(2_000)

		await expect(query).rejects.toThrow('timed out after 2000 ms')
	})

	it('wraps a session directly and keeps its own methods working', async () => {
		const session = with_timeout({ db: fake_d1({ session_bookmark: 'bookmark-42' }).withSession() })

		expect(session.getBookmark()).toBe('bookmark-42')
		await expect(session.prepare('SELECT 1').first()).resolves.toEqual({ sql: 'SELECT 1', values: [] })
	})

	it('still looks like a D1 binding to libraries that detect one by its methods', () => {
		const db = with_timeout({ db: fake_d1() })

		expect('batch' in db && 'exec' in db && 'prepare' in db).toBe(true)
	})

	it('keeps statement methods it does not time out working', () => {
		const db = with_timeout({ db: fake_d1() })

		const statement = db.prepare('SELECT ?').bind(1) as D1PreparedStatement & { describe: () => string }

		expect(statement.describe()).toBe('SELECT ? [1]')
	})
})

// A database that fails its first `failures` queries with `error`, then answers. `executed` counts
// what reached the database, which for a write is what the caller would see in its rows.
function flaky_d1({ failures, error }: { failures: number, error: string }) {
	const executed: string[] = []
	const db = fake_d1({
		respond: async query => {
			executed.push(query.sql)
			if (executed.length <= failures) throw new Error(error)
			return { rows: [query.sql] }
		},
	})
	return { db: with_timeout({ db }), executed }
}

// Local dev: two dev servers sharing one D1 file make workerd fail a session read's bookmark on a
// lock instead of waiting (ADR 0027). Production: Cloudflare lists these as safe to retry for
// idempotent queries (https://developers.cloudflare.com/d1/observability/debug-d1/).
const TRANSIENT_ERRORS = [
	'D1_ERROR: Failed to get session commit token: internal error; reference = abc123',
	'D1_ERROR: Network connection lost.',
	'D1_ERROR: Replica disconnected from primary.',
	'D1_ERROR: D1 DB reset because its code was updated.',
	'D1_ERROR: Internal error while starting up D1 DB storage caused object to be reset.',
]

describe('with_timeout retrying reads', () => {
	it.each(TRANSIENT_ERRORS)('retries a read that fails with "%s"', async error => {
		const { db } = flaky_d1({ failures: 1, error })

		await expect(db.prepare('SELECT permission FROM Permissions').all()).resolves.toEqual({ rows: ['SELECT permission FROM Permissions'] })
	})

	it('retries a read whose SQL starts on a later line, as template literals do', async () => {
		const { db } = flaky_d1({ failures: 2, error: TRANSIENT_ERRORS[0] })

		await expect(db.withSession().prepare(`
			SELECT u.id
			FROM Users u
		`).bind('user@example.com').first()).resolves.toBeDefined()
	})

	it('gives up after three attempts, passing the last error through', async () => {
		const { db, executed } = flaky_d1({ failures: 3, error: TRANSIENT_ERRORS[1] })

		await expect(db.prepare('SELECT 1').raw()).rejects.toThrow('Network connection lost')
		expect(executed).toHaveLength(3)
	})

	it('never repeats a write, which may have taken effect before failing', async () => {
		const { db, executed } = flaky_d1({ failures: 1, error: TRANSIENT_ERRORS[1] })

		await expect(db.prepare('INSERT INTO Users (email) VALUES (?)').bind('user@example.com').run()).rejects.toThrow('Network connection lost')
		expect(executed).toHaveLength(1)
	})

	it('does not retry an error that will fail again the same way', async () => {
		const { db, executed } = flaky_d1({ failures: 1, error: 'D1_ERROR: no such table: Permissions' })

		await expect(db.prepare('SELECT * FROM Permissions').all()).rejects.toThrow('no such table')
		expect(executed).toHaveLength(1)
	})
})
