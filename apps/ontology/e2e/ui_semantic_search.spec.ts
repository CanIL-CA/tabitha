import { expect, test } from '@tabitha/vite-config/playwright'

// Related concepts come from a Vectorize index, which has no local simulation (see the "vectorize"
// note in wrangler.jsonc), so locally the semantic scope can only ever add nothing. What this can
// check is that an unreachable index degrades to the plain stem results rather than an error page;
// find_related_concepts' own ranking and filtering are covered by semantic_search.test.ts.
test('semantic search still shows the plain stem results when the index is unreachable', async ({ page }) => {
	await page.goto('/?q=love&category=all&scope=semantic')

	const results_badge = page.locator('header em.badge')
	await expect(results_badge).toBeVisible()
	await expect(results_badge).toContainText('results')

	const cards = page.locator('article.card')
	await expect(cards.first()).toBeVisible()
})
