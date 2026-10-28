import type { D1Database, D1DatabaseSession, D1PreparedStatement } from '@cloudflare/workers-types'

type D1Handle = D1Database | D1DatabaseSession

type QueryMethod = (...args: unknown[]) => Promise<unknown>

// D1 calls take no AbortSignal and have hung at a single colo for minutes while the rest of the
// network stayed fast. Failing after this long turns an endless spinner into an error page.
export const DEFAULT_D1_TIMEOUT_MS = 15_000

const STATEMENT_QUERY_METHODS = new Set(['first', 'all', 'run', 'raw'])

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

	const wrapped = new Proxy(statement, {
		get(target, property) {
			if (property === 'bind') {
				return (...values: unknown[]) => wrap_statement({ statement: target.bind(...values), sql, timeout_ms })
			}

			if (typeof property === 'string' && STATEMENT_QUERY_METHODS.has(property)) {
				const query = Reflect.get(target, property, target) as QueryMethod
				return (...args: unknown[]) => race_timeout({ promise: query.apply(target, args), timeout_ms, label })
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
