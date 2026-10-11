import { expect, test } from '@playwright/test'
import { wait_for_hydration } from '@tabitha/vite-config/playwright'

test('generating notes for a verse fetches real encoding/text data, runs it through the flag/trigger pipeline, and renders AI-produced notes', async ({ page }) => {
	// Genesis 1:1 is the app's default verse. Wait for hydration (the button's click handler
	// being wired up) before interacting with it.
	await page.goto('/')
	await wait_for_hydration({ page })

	await page.getByRole('button', { name: 'Get notes' }).click()

	const heading = page.getByRole('heading', { name: 'Notes for Genesis 1:1' })
	await expect(heading).toBeVisible()

	// The default mode is "brief", so the whole pipeline runs: real source/target lookups, flag
	// extraction and weighting, the semantic-notes AI call, the (mocked) Aquifer lookup, and the
	// brief AI call. The real network lookups can be slow on CI, hence the longer timeout.
	await expect(page.getByText('[e2e mock] TNN note for this verse.')).toBeVisible({ timeout: 30_000 })

	// The mocked AI response (see e2e/support/mock_ai_gateway.mjs) echoes a note back for every
	// trigger the real pipeline selected for this verse, so this confirms the semantic notes made
	// it into the brief rather than erroring out.
	await expect(page.getByText('[e2e mock] meaning for trigger', { exact: false }).first()).toBeVisible()
})
