import { create_app_playwright_config } from '@tabitha/vite-config/playwright'

export default create_app_playwright_config({
	port: 1947,
	// Mints a signed-in session for tests without touching Google OAuth (e2e/support/sign_in.ts).
	globalSetup: './e2e/auth.setup.ts',
	use: { storageState: 'e2e/.auth/user.json' },
})
