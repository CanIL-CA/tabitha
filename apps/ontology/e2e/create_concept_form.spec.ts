// @ts-check
import type { Page } from '@playwright/test'
import { expect, test, wait_for_hydration } from '@tabitha/vite-config/playwright'

async function next_sense({ page, stem, part_of_speech }: { page: Page, stem: string, part_of_speech: string }): Promise<string> {
	const response = await page.request.get(`/protected/concept/create/next-sense?stem=${stem}&part_of_speech=${part_of_speech}`)
	const { next_sense } = await response.json()
	return next_sense
}

test('changing the part of speech looks up its next sense and resets its categories', async ({ page }) => {
	const noun_sense = await next_sense({ page, stem: 'make', part_of_speech: 'Noun' })
	const verb_sense = await next_sense({ page, stem: 'make', part_of_speech: 'Verb' })
	// the test only shows a second lookup happened if the two answers differ
	expect(verb_sense).not.toBe(noun_sense)

	await page.goto('/protected/concept/create')
	await wait_for_hydration({ page })

	const sense = page.locator('input[name="sense"]')
	const part_of_speech = page.locator('select[name="part_of_speech"]')

	await page.locator('input[name="stem"]').fill('make')
	await expect(sense).toHaveValue(noun_sense)

	await part_of_speech.selectOption('Verb')
	await expect(sense).toHaveValue(verb_sense)

	const agent = page.locator('select[name="categories[]"]').first()
	await expect(agent).toHaveValue('Agent-like')

	await agent.selectOption('(Agent-like)')
	await part_of_speech.selectOption('Adjective')
	await part_of_speech.selectOption('Verb')

	await expect(page.locator('select[name="categories[]"]').first()).toHaveValue('Agent-like')
})
