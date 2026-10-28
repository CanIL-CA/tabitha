# @tabitha/vite-config

Shared Vite, Playwright, and SvelteKit configuration helpers for Tabitha applications.

---

## ⚙️ Usage

### 1. Vite Configuration (`vite.config.js`)

```js
import { create_app_vite_config } from '@tabitha/vite-config'
import { PORTS } from '@tabitha/vite-config/ports'

export default create_app_vite_config({ port: PORTS.editor.port })
```

### 2. SvelteKit Configuration

SvelteKit 3 reads its config from the `sveltekit()` Vite plugin, so `create_app_vite_config` sets it up too (the Cloudflare adapter, `vitePreprocess`, 30-minute version polling). Pass app-specific SvelteKit options as `kit`:

```js
export default create_app_vite_config({ port: PORTS.editor.port, kit: { csrf: { trustedOrigins: ['https://example.com'] } } })
```

Apps get the types for `env` from `cloudflare:workers` through `@tabitha/tsconfig/sveltekit-app.json`, which lists `"@tabitha/vite-config/cloudflare-workers"` in its `types` (see `cloudflare_workers.d.ts` for why), and unit tests get an empty stand-in for that module.

### 3. Playwright E2E Configuration (`playwright.config.js`)

```js
import { create_app_playwright_config } from '@tabitha/vite-config/playwright'

export default create_app_playwright_config({ port: 1337 })
```

Specs import `test` and `expect` from `@tabitha/vite-config/playwright` rather than `@playwright/test`. With `E2E_COVERAGE=1` set, that `test` records browser coverage for every test that uses `page` (Chromium only) into the app's `coverage/e2e/raw`. `create_app_vite_config` also records the dev server's own code (`+server.ts` routes, hooks and what they call) into `coverage/e2e-server` when it gets SIGINT or SIGTERM (`server_coverage.js`); `bun run test:e2e` stops its servers that way. CI's `coverage_layers` job joins it with the unit coverage (`bun run test:coverage:merge`). To run it locally:

```sh
bun run test:coverage
E2E_COVERAGE=1 bun run test:e2e
bun run test:coverage:merge
```
