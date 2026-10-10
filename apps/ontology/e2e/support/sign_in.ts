import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Relative, not #lib: Playwright's loader resolves package.json subpath imports without mapping .js to .ts.
import { create_auth_options } from '../../src/lib/server/better_auth.js'
import type { D1Database } from '@cloudflare/workers-types'
import type { BrowserContext } from '@playwright/test'
import { betterAuth } from 'better-auth'
import { testUtils } from 'better-auth/plugins'
import { getPlatformProxy } from 'wrangler'

// See e2e/README.md for why this exists and how it works.

const app_dir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const root_dir = join(app_dir, '../..')

function read_env_var(name: string): string {
	for (const file of ['.env.local', '.env']) {
		const path = join(app_dir, file)
		if (!existsSync(path)) continue
		const match = readFileSync(path, 'utf-8').match(new RegExp(`^${name}=(.*)$`, 'm'))
		if (match?.[1]) return match[1].trim()
	}
	throw new Error(`Missing ${name} in apps/ontology/.env.local -- run \`bun run setup:env\` first.`)
}

/**
 * Grants `email` Ontology permissions (all of them when none are listed), then signs it in on
 * `context` with a real session in the local Auth D1, created by Better Auth's test utilities.
 */
export async function sign_in_as({ context, email, permissions = [] }: {
	context: BrowserContext
	email: string
	permissions?: string[]
}) {
	execFileSync('bun', [join(root_dir, 'scripts/dx/grant_permission.ts'), email, ...permissions], { stdio: 'inherit' })

	// The same local D1 the dev server reads. getPlatformProxy()'s default persist path is relative to
	// the working directory, so it's pinned to the app's own state.
	const proxy = await getPlatformProxy<{ DB_Auth: D1Database, BETTER_AUTH_SECRET?: string }>({
		configPath: join(app_dir, 'wrangler.jsonc'),
		persist: { path: join(app_dir, '.wrangler', 'state', 'v3') },
	})

	try {
		// https://www.better-auth.com/docs/plugins/test-utils
		const test_auth = betterAuth({
			...create_auth_options({
				db_auth: proxy.env.DB_Auth,
				secret: proxy.env.BETTER_AUTH_SECRET || read_env_var('BETTER_AUTH_SECRET'),
				// Never called: sessions are created directly, not through Google.
				google_client_id: 'e2e',
				google_client_secret: 'e2e',
			}),
			baseURL: 'http://localhost:3056',
			plugins: [testUtils()],
		})
		const { test, internalAdapter } = await test_auth.$context

		const existing = await internalAdapter.findUserByEmail(email)
		const user = existing?.user ?? await test.saveUser(test.createUser({ email, name: email }))

		await context.addCookies(await test.getCookies({ userId: user.id }))
	} finally {
		await proxy.dispose()
	}
}
