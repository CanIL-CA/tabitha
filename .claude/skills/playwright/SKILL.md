---
name: playwright
description: Playwright End-to-End (E2E) test development skill. TRIGGER when writing, inspecting, fixing, or refactoring Playwright tests, e2e spec files (*.spec.ts, *.spec.js), playwright.config.js files, or browser automation workflows.
metadata:
  version: 1.x
---

# Playwright E2E Testing Best Practices

Guidelines for writing fast, resilient, and deterministic end-to-end tests across TaBiThA applications.

---

## 1. Resilient User-Facing Locators

Always prioritize user-facing role, label, and text locators over brittle CSS class or XPath selectors:

```typescript
// ✅ Preferred: User-visible roles and text
const submit_btn = page.getByRole('button', { name: 'Submit' })
const search_input = page.getByPlaceholder('Search concepts...')
const nav_link = page.getByRole('link', { name: 'Ontology' })
const card_heading = page.getByRole('heading', { level: 2, name: 'write-01' })

// ❌ Avoid: Implementation-dependent CSS selectors
const btn = page.locator('div.container > form > button.btn-primary')
```

---

## 2. Web-First Assertions (Auto-Waiting)

Always use `await expect(locator)` web-first assertions which automatically poll until the condition is met:

```typescript
// ✅ Preferred: Auto-waiting assertions
await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 5000 })
await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
await expect(page.locator('tbody tr')).toHaveCount(10)

// ❌ Avoid: Arbitrary timeouts / sleep
await page.waitForTimeout(2000) // Never use arbitrary sleeps
```

### Readiness: assert, don't wait for the network to go quiet

Playwright marks `waitUntil: 'networkidle'` (and its `waitForLoadState` form) as discouraged for tests: rely on web assertions to assess readiness instead. Don't add a wait to make a slow page "settle".

- A slow first load on a cold dev server (Vite re-optimizing dependencies) is a timing problem. Give the one retrying assertion that follows a longer `timeout`; it returns as soon as the condition holds, so it costs nothing when the server is fast:
  ```typescript
  await expect(page).toHaveURL(/\/Bible\/Genesis\/1\/1$/, { timeout: 20_000 })
  ```
- A test that must not act before hydration (the click would otherwise be a no-op) should wait on something concrete that hydration produces, not on the network.
- Some existing specs still use `networkidle`; replace them when touching those files.

---

## 3. Standardized App Configuration (`@tabitha/vite-config/playwright`)

Each application uses the shared helper in `playwright.config.js`:

```javascript
import { create_app_playwright_config } from '@tabitha/vite-config/playwright'
import { PORTS } from '@tabitha/vite-config/ports'

export default create_app_playwright_config({ port: PORTS.ontology.port })
```

- `webServer.command` runs `bun run dev:e2e` with `reuseExistingServer: true`, so the root `test:e2e` script (`scripts/ci/run_e2e.ts`) can start every app's dev server up front.

---

## 4. API Route Testing via Playwright `request`

Use the `request` fixture for fast HTTP contract tests without launching a full browser context:

```typescript
import { expect, test } from '@playwright/test'

test('API contract: /search?q=love', async ({ request }) => {
	const response = await request.get('/search?q=love')
	expect(response.status()).toBe(200)

	const data = await response.json()
	expect(Array.isArray(data)).toBe(true)
	expect(data.length).toBeGreaterThan(0)
})
```
