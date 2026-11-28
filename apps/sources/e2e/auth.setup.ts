import { chromium } from '@playwright/test'
import { sign_in_as } from './support/sign_in'

// Mints a signed-in session once for the whole suite, as apps/ontology/e2e/auth.setup.ts does.

// Each app's suite has its own test user: the suites run at once against one local DB_Auth, where
// two of them creating the same user would race.
const TEST_USER_EMAIL = 'e2e-sources@tabitha.local'
const STORAGE_STATE_PATH = 'e2e/.auth/user.json'

export default async function global_setup() {
	const browser = await chromium.launch()
	const context = await browser.newContext()
	await sign_in_as({ context, email: TEST_USER_EMAIL })
	await context.storageState({ path: STORAGE_STATE_PATH })
	await browser.close()
}
