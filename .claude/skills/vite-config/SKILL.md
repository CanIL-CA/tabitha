---
name: vite-config
description: Vite, SvelteKit, and build configuration skill for TaBiThA. TRIGGER when inspecting, creating, or modifying vite.config.js (which holds the SvelteKit config since SvelteKit 3) or package build configurations across apps and packages.
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

## 2. SvelteKit configuration (no `svelte.config.js`)

SvelteKit 3 no longer reads `svelte.config.js`; its options go to the `sveltekit()` plugin, which `create_app_vite_config` registers with:

- `@sveltejs/adapter-cloudflare`, `vitePreprocess()`, and a 30-minute `version.pollInterval`.
- App-specific SvelteKit options passed as `kit` and spread over those defaults.
- A Vitest alias that stubs `cloudflare:workers`, and `@tabitha/vite-config/cloudflare-workers` for typing `env` from it (already in `@tabitha/tsconfig/sveltekit-app.json`'s `types`).

---

## 3. Playwright Configuration (`playwright.config.js`)

Applications with E2E tests use `create_app_playwright_config`:

```javascript
import { create_app_playwright_config } from '@tabitha/vite-config/playwright'

export default create_app_playwright_config({ port: 1337 })
```

- Manages the `webServer` lifecycle, running `bun run dev:e2e` on the app's port.
