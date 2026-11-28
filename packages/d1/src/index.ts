import type { D1Database, D1DatabaseSession, D1PreparedStatement } from '@cloudflare/workers-types'

type D1Handle = D1Database | D1DatabaseSession

type QueryMethod = (...args: unknown[]) => Promise<unknown>

// D1 calls take no AbortSignal and have hung at a single colo for minutes while the rest of the
// network stayed fast. Failing after this long turns an endless spinner into an error page.
export const DEFAULT_D1_TIMEOUT_MS = 15_000

const STATEMENT_QUERY_METHODS = new Set(['first', 'all', 'run', 'raw'])

// A read can safely run again; a write may have taken effect before its error arrived.
const READ_ONLY_SQL = /^\s*SELECT\b/i

// Two retries, as D1 itself gives read-only queries on a lost connection.
const RETRY_DELAYS_MS = [50, 150]

// Errors Cloudflare lists as safe to retry for idempotent queries
// (https://developers.cloudflare.com/d1/observability/debug-d1/), and the session bookmark workerd
// fails to read, rather than waiting, when two local dev servers share one D1 file (ADR 0027).
const TRANSIENT_ERRORS = [
	'Network connection lost',
	'Replica disconnected from primary',
	'reset because its code was updated',
	'storage caused object to be reset',
	'Failed to get session commit token',
]

function is_transient(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return TRANSIENT_ERRORS.some(text => message.includes(text))
}

async function retry_transient<T>({ attempt }: { attempt: () => Promise<T> }): Promise<T> {
	for (const delay_ms of RETRY_DELAYS_MS) {
		try {
			return await attempt()
		} catch (error) {
			if (!is_transient(error)) throw error
			await new Promise(resolve => setTimeout(resolve, delay_ms))
		}
	}
	return attempt()
}

// batch() needs the binding's own statements, not the wrappers handed out by prepare()
const unwrapped_statements = new WeakMap<D1PreparedStatement, D1PreparedStatement>()

type RaceTimeoutOptions<T> = {
	readonly promise: Promise<T>
	readonly timeout_ms: number
	readonly label: string
}

function race_timeout<T>({ promise, timeout_ms, label }: RaceTimeoutOptions<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(`D1 query timed out after ${timeout_ms} ms: ${label}`)), timeout_ms)
	})

	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function bind_member({ target, property }: { target: object, property: string | symbol }): unknown {
	const value = Reflect.get(target, property, target)
	return typeof value === 'function' ? value.bind(target) : value
}

type WrapStatementOptions = {
	readonly statement: D1PreparedStatement
	readonly sql: string
	readonly timeout_ms: number
}

function wrap_statement({ statement, sql, timeout_ms }: WrapStatementOptions): D1PreparedStatement {
	const label = sql.replace(/\s+/g, ' ').trim().slice(0, 120)
	const read_only = READ_ONLY_SQL.test(sql)

	const wrapped = new Proxy(statement, {
		get(target, property) {
			if (property === 'bind') {
				return (...values: unknown[]) => wrap_statement({ statement: target.bind(...values), sql, timeout_ms })
			}

			if (typeof property === 'string' && STATEMENT_QUERY_METHODS.has(property)) {
				const query = Reflect.get(target, property, target) as QueryMethod
				const attempt = (args: unknown[]) => race_timeout({ promise: query.apply(target, args), timeout_ms, label })
				return (...args: unknown[]) => read_only ? retry_transient({ attempt: () => attempt(args) }) : attempt(args)
			}

			return bind_member({ target, property })
		},
	})

	unwrapped_statements.set(wrapped, statement)
	return wrapped
}

type WithTimeoutOptions<T extends D1Handle> = {
	readonly db: T
	readonly timeout_ms?: number
}

/**
 * The same database or session, with every query (`first`, `all`, `run`, `raw`, `batch`, `exec`)
 * rejected once it runs longer than `timeout_ms`. Sessions started from a wrapped database are
 * wrapped too. The query itself can't be canceled; only the wait for it ends.
 *
 * A prepared `SELECT` that fails with a transient error is also tried up to twice more, each
 * attempt with its own timeout. Writes, `batch` and `exec` are never retried.
 */
export function with_timeout<T extends D1Handle>({ db, timeout_ms = DEFAULT_D1_TIMEOUT_MS }: WithTimeoutOptions<T>): T {
	return new Proxy(db, {
		get(target, property) {
			if (property === 'prepare') {
				return (sql: string) => wrap_statement({ statement: target.prepare(sql), sql, timeout_ms })
			}

			if (property === 'batch') {
				return (statements: D1PreparedStatement[]) => race_timeout({
					promise: target.batch(statements.map(statement => unwrapped_statements.get(statement) ?? statement)),
					timeout_ms,
					label: `batch of ${statements.length} statements`,
				})
			}

			if (property === 'exec' && 'exec' in target) {
				return (sql: string) => race_timeout({ promise: target.exec(sql), timeout_ms, label: sql.slice(0, 120) })
			}

			if (property === 'withSession' && 'withSession' in target) {
				return (constraint_or_bookmark?: string) => with_timeout({ db: target.withSession(constraint_or_bookmark), timeout_ms })
			}

			return bind_member({ target, property })
		},
	})
}
