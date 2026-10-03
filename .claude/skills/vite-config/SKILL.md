---
name: vite-config
description: Vite, SvelteKit, and build configuration skill for TaBiThA. TRIGGER when inspecting, creating, or modifying vite.config.js, svelte.config.js, or package build configurations across apps and packages.
metadata:
  version: 1.x
---

# Vite & SvelteKit Monorepo Configuration Best Practices

Guidelines for configuring applications using the centralized `@tabitha/vite-config` package.

---

## 1. Application `vite.config.js`

Every SvelteKit application in `apps/*` uses `create_app_vite_config` to eliminate boilerplate. The exception is `apps/scheduler`, a plain cron-only Worker built by Wrangler with no Vite at all -- don't scaffold Vite, SvelteKit, or a port into it (see CONTRIBUTING.md's "How to Add a New App"):

```javascript
import { create_app_vite_config } from '@tabitha/vite-config'
import { PORTS } from '@tabitha/vite-config/ports'

export default create_app_vite_config({
	port: PORTS.editor.port, // Dedicated application port -- single source of truth, see packages/vite-config/ports.js
	// Optional plugin overrides or custom alias mappings
})
```

### Standard Dedicated Ports
- **Ontology**: `3056`
- **Targets**: `1382`
- **Sources**: `1947`
- **Editor**: `1337`
- **Copilot**: `9000`
- **Www**: `1455`

`create_app_vite_config` enables `strictPort: true`, wires `@tailwindcss/vite`, registers `sveltekit()`, and embeds Vitest test configurations.

---

## 2. Application `svelte.config.js`

Every SvelteKit application uses `create_app_svelte_config` configured for Cloudflare Workers:

```javascript
import { create_app_svelte_config } from '@tabitha/vite-config/svelte'

export default create_app_svelte_config()
```

- Pre-configures `@sveltejs/adapter-cloudflare` and `vitePreprocess()`.

---

## 3. Playwright Configuration (`playwright.config.js`)

Applications with E2E tests use `create_app_playwright_config`:

```javascript
import { create_app_playwright_config } from '@tabitha/vite-config/playwright'

export default create_app_playwright_config({ port: 1337 })
```

- Manages the `webServer` lifecycle, running `bun run dev:e2e` on the app's port.
