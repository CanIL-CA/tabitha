import { chromium } from '@playwright/test'
import { sign_in_as } from './support/sign_in'

// See apps/ontology/e2e/README.md for why this exists and how it works.

// Each app's suite has its own test user: the suites run at once against one local DB_Auth, where
// two of them creating the same user would race.
const TEST_USER_EMAIL = 'e2e-ontology@tabitha.local'
const STORAGE_STATE_PATH = 'e2e/.auth/user.json'

export default async function global_setup() {
	const browser = await chromium.launch()
	const context = await browser.newContext()
	await sign_in_as({ context, email: TEST_USER_EMAIL })
	await context.storageState({ path: STORAGE_STATE_PATH })
	await browser.close()
}
