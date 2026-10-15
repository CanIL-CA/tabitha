import { expect, test, type Page } from '@playwright/test'
import { wait_for_hydration } from '@tabitha/vite-config/playwright'
import { PORTS } from '@tabitha/vite-config/ports'

const ONTOLOGY_ORIGIN = `http://localhost:${PORTS.ontology.port}`

function track_ontology_requests(page: Page): string[] {
	const requests: string[] = []
	page.on('request', request => {
		if (new URL(request.url()).origin === ONTOLOGY_ORIGIN) requests.push(request.url())
	})
	return requests
}

async function open_sidebar_detail({ page, title }: { page: Page, title: string }) {
	await page.locator('.collapse', { hasText: title }).first().locator('input[type="checkbox"]').check()
}

test("a concept's sidebar shows its ontology data without the browser calling ontology", async ({ page }) => {
	const ontology_requests = track_ontology_requests(page)

	await page.goto('/Bible/Genesis/1/1')
	await wait_for_hydration({ page })
	await page.getByText('make', { exact: true }).first().click()

	await open_sidebar_detail({ page, title: 'Concept Details' })
	await open_sidebar_detail({ page, title: 'All Senses' })

	const concept_details = page.locator('.collapse', { hasText: 'Concept Details' }).first()
	await expect(concept_details.getByText('make-A')).toBeVisible()
	await expect(concept_details.getByText('(LDV) to create an artifact')).toBeVisible()

	const all_senses = page.locator('.collapse', { hasText: 'All Senses' }).first()
	await expect(all_senses.getByText('make-B')).toBeVisible()

	// the page's load fetched every concept's senses on the server, so the browser never has to;
	// a request from here would mean a component is loading its own data again
	expect(ontology_requests).toEqual([])
})

test("changing a concept in the editor shows the new stem's senses, which the page never loaded", async ({ page }) => {
	await page.goto('/Bible/Genesis/1/1/edit')
	await wait_for_hydration({ page })
	await page.getByText('make', { exact: true }).first().click()
	await open_sidebar_detail({ page, title: 'Concept Details' })
	await open_sidebar_detail({ page, title: 'All Senses' })

	const concept_details = page.locator('.collapse', { hasText: 'Concept Details' }).first()
	await concept_details.getByRole('button', { name: 'Change' }).click()

	const concept_select = page.getByRole('dialog').getByRole('combobox')
	const build_a = concept_select.getByRole('option', { name: /^build-A / })
	await expect(build_a).toBeAttached()
	await concept_select.selectOption(await build_a.getAttribute('value') ?? '')
	await page.getByRole('button', { name: 'SELECT' }).click()

	await expect(concept_details.getByText('build-A')).toBeVisible()
	await expect(page.locator('.collapse', { hasText: 'All Senses' }).first().getByText('build-B')).toBeVisible()
})
