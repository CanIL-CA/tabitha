import { test, expect, type BrowserContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode } from '@auth/core/jwt'

// Mirrors auth.setup.ts's approach (see e2e/README.md), but for a second, lower-privileged identity
// scoped to just this spec -- the suite's shared storageState is always the fully-authorized fixture user.
const SESSION_COOKIE_NAME = 'authjs.session-token'
const app_dir = dirname(dirname(fileURLToPath(import.meta.url)))
const root_dir = join(app_dir, '../..')

function read_env_var(name: string) {
	for (const file of ['.env.local', '.env']) {
		const path = join(app_dir, file)
		if (!existsSync(path)) continue
		const match = readFileSync(path, 'utf-8').match(new RegExp(`^${name}=(.*)$`, 'm'))
		if (match) return match[1].trim()
	}
	throw new Error(`Missing ${name} in apps/ontology/.env.local -- run \`bun run setup:env\` first.`)
}

async function sign_in_as({ context, email, permissions }: {
	context: BrowserContext
	email: string
	permissions: string[]
}) {
	execFileSync('bun', [join(root_dir, 'scripts/dx/grant_permission.ts'), email, ...permissions], { stdio: 'inherit' })

	const session_token = await encode({
		secret: read_env_var('AUTH_SECRET'),
		salt: SESSION_COOKIE_NAME,
		token: { email, name: email },
	})
	await context.addCookies([{
		name: SESSION_COOKIE_NAME,
		value: session_token,
		domain: 'localhost',
		path: '/',
		httpOnly: true,
		sameSite: 'Lax',
	}])
}

test('a suggest-tier user\'s edit is held for approval, and an authorized reviewer can approve it', async ({ page, browser }) => {
	const suggester_email = `e2e-suggester-${Date.now()}@tabitha.local`
	const gloss = `suggested gloss ${Date.now()}`

	// The suggester has PROTECTED_ACCESS but neither ADD_CONCEPT nor UPDATE_CONCEPT -- exactly the
	// tier this feature adds: reachable, but not authorized to apply a change directly.
	const suggester_context = await browser.newContext()
	await sign_in_as({ context: suggester_context, email: suggester_email, permissions: ['PROTECTED_ACCESS'] })
	const suggester_page = await suggester_context.newPage()

	await suggester_page.goto('/protected/concept/update?concept=love-A-Verb')
	// Clicking before hydration finishes silently no-ops -- the SSR'd button has no handler attached yet.
	await suggester_page.waitForLoadState('networkidle')
	await suggester_page.locator('textarea[name="gloss"]').fill(gloss)
	await suggester_page.getByRole('button', { name: 'Save' }).click()
	await expect(suggester_page.getByText(/pending in the changes queue/i)).toBeVisible()
	await suggester_context.close()

	// The default `page` fixture carries the suite's fully-authorized fixture user (see e2e/README.md).
	await page.goto('/protected/changes?status=pending')
	// Clicking before hydration finishes silently no-ops -- the SSR'd button has no handler attached yet.
	await page.waitForLoadState('networkidle')
	const row = page.locator('tr', { hasText: gloss })
	await expect(row.getByText(suggester_email)).toBeVisible()

	await row.getByRole('button', { name: 'Approve' }).click()
	await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0)

	// Also apply it -- otherwise this test would leave a permanently unapplied change behind on the
	// shared `love-A-Verb` fixture concept, which other specs (e.g. offline_pending_changes.spec.ts)
	// assume has no other pending changes of its own.
	await page.getByRole('button', { name: 'Apply pending changes now' }).click()
	await expect(page.getByText(/successfully applied/i)).toBeVisible()
})
