import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Relative, not #lib: Playwright's loader resolves package.json subpath imports without mapping .js to .ts.
import { SOURCES_AUTH_SETTINGS } from '../../src/lib/server/better_auth.js'
import { create_auth_options } from '@tabitha/auth'
import type { D1Database } from '@cloudflare/workers-types'
import type { BrowserContext } from '@playwright/test'
import { betterAuth } from 'better-auth'
import { testUtils } from 'better-auth/plugins'
import { getPlatformProxy } from 'wrangler'
import { LOCAL_PERSIST_PATH } from '@tabitha/vite-config/local-state'

// The same technique as apps/ontology/e2e/support/sign_in.ts (ADR 0021).

const app_dir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const root_dir = join(app_dir, '../..')

function read_env_var(name: string): string {
	for (const file of ['.env.local', '.env']) {
		const path = join(app_dir, file)
		if (!existsSync(path)) continue
		const match = readFileSync(path, 'utf-8').match(new RegExp(`^${name}=(.*)$`, 'm'))
		if (match?.[1]) return match[1].trim()
	}
	throw new Error(`Missing ${name} in apps/sources/.env.local -- run \`bun run setup:env\` first.`)
}

// Every app's e2e suite runs at once against the one local DB_Auth, and workerd fails a write that
// loses a lock race at once (SQLITE_BUSY) rather than waiting for the lock.
async function retry_when_busy<T>({ attempt }: { attempt: () => Promise<T> }): Promise<T> {
	for (let tries = 1; ; tries++) {
		try {
			return await attempt()
		} catch (error) {
			if (tries >= 5 || !String(error).includes('SQLITE_BUSY')) throw error
			await new Promise(resolve => setTimeout(resolve, 100 * tries))
		}
	}
}

/**
 * Grants `email` Sources permissions (all of them when none are listed), then signs it in on
 * `context` with a real session in Sources' local Auth D1, created by Better Auth's test utilities.
 */
export async function sign_in_as({ context, email, permissions = [] }: {
	context: BrowserContext
	email: string
	permissions?: string[]
}) {
	execFileSync('bun', [join(root_dir, 'scripts/dx/grant_permission.ts'), '--app=sources', email, ...permissions], { stdio: 'inherit' })

	// The same local D1 the dev server reads: every app's, since they share one local state folder.
	const proxy = await getPlatformProxy<{ DB_Auth: D1Database, BETTER_AUTH_SECRET?: string }>({
		configPath: join(app_dir, 'wrangler.jsonc'),
		persist: { path: LOCAL_PERSIST_PATH },
	})

	try {
		// https://www.better-auth.com/docs/plugins/test-utils
		const test_auth = betterAuth({
			...create_auth_options({
				...SOURCES_AUTH_SETTINGS,
				db_auth: proxy.env.DB_Auth,
				secret: proxy.env.BETTER_AUTH_SECRET || read_env_var('BETTER_AUTH_SECRET'),
				// Never called: sessions are created directly, not through Google.
				google_client_id: 'e2e',
				google_client_secret: 'e2e',
			}),
			baseURL: 'http://localhost:1947',
			plugins: [testUtils()],
		})
		const { test, internalAdapter } = await test_auth.$context

		const cookies = await retry_when_busy({
			attempt: async () => {
				const existing = await internalAdapter.findUserByEmail(email)
				const user = existing?.user ?? await test.saveUser(test.createUser({ email, name: email }))
				return test.getCookies({ userId: user.id })
			},
		})

		await context.addCookies(cookies)
	} finally {
		await proxy.dispose()
	}
}
