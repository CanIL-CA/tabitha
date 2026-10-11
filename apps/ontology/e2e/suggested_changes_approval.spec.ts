import { test, expect } from '@playwright/test'
import { wait_for_hydration } from '@tabitha/vite-config/playwright'
import { sign_in_as } from './support/sign_in'

// Signs in a second, lower-privileged identity scoped to just this spec -- the suite's shared
// storageState is always the fully-authorized fixture user (see e2e/README.md).

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
	await wait_for_hydration({ page: suggester_page })
	await suggester_page.locator('textarea[name="gloss"]').fill(gloss)
	await suggester_page.getByRole('button', { name: 'Save' }).click()
	await expect(suggester_page.getByText(/pending in the changes queue/i)).toBeVisible()
	await suggester_context.close()

	// The default `page` fixture carries the suite's fully-authorized fixture user (see e2e/README.md).
	await page.goto('/protected/changes?status=pending')
	// Clicking before hydration finishes silently no-ops -- the SSR'd button has no handler attached yet.
	await wait_for_hydration({ page })
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
