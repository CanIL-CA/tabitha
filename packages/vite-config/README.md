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
