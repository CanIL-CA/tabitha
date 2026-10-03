---
name: monorepo-packages
description: Monorepo package architecture, shared workspace libraries, and coding standards skill. TRIGGER when creating or modifying shared packages (@tabitha/types, @tabitha/ui, @tabitha/api-client, @tabitha/tsconfig, @tabitha/eslint-config) or reviewing monorepo conventions.
metadata:
  version: 1.x
---

# Monorepo Packages & Development Conventions

Guidelines for architecting shared packages and adhering to coding standards across the TaBiThA monorepo.

---

## 1. Shared Workspace Packages (`packages/*`)

| Package | Purpose & Guidelines |
| --- | --- |
| **`@tabitha/types`** | Central repository for all universal TypeScript interfaces (linguistic concepts, clauses, token representations, and API payloads). Keep free of runtime dependencies. |
| **`@tabitha/ui`** | Reusable Svelte 5 components styled with daisyUI 5. Export components from `src/index.ts`. |
| **`@tabitha/api-client`** | Typed HTTP client for inter-service communication between the apps. |
| **`@tabitha/ai`** | Shared LLM client (`generate_json`, `generate_text`) routing every app's AI calls through the Cloudflare AI Gateway to Vertex AI. |
| **`@tabitha/cors`** | Shared CORS middleware for Worker request handlers. |
| **`@tabitha/complex-terms`** | Reads the how-to Google Sheet into `Complex_Terms` rows; shared by `apps/ontology` and `tools/databases`. |
| **`@tabitha/rate-limit`** | Workers-native rate limiting for public read APIs (`enforce_rate_limit`, a SvelteKit handle). |
| **`@tabitha/usage`** | Anonymous feature-usage events written to Workers Analytics Engine (`record_usage_event`). |
| **`@tabitha/vite-config`** | Centralized Vite, SvelteKit, Vitest, and Playwright configuration generators. |
| **`@tabitha/eslint-config`** | Standardized ESLint 9 flat configuration. |
| **`@tabitha/tsconfig`** | Base TypeScript compiler configurations (`base.json`, `svelte.json`). |

---

## 2. Package Boundaries & Dependency Flow

- **Dependency Direction**: `apps/*` may depend on `packages/*`. Packages must **never** import from `apps/*`.
- **Zero Circular Dependencies**: Shared packages must maintain clean, acyclic dependency hierarchies.
- **Runtime Dependency Discipline**: `@tabitha/types` must remain 100% free of runtime dependencies.

---

## 3. YAGNI & The Rule of Three for Shared Packages

Shared runtime code and shared types follow different rules, because they fail differently.

**Runtime code** (components, clients, helpers): before extracting it into `packages/*`, apply the **Rule of Three** (Philosophy #12):

1. **First Use**: Implement directly inside the specific app (`apps/editor`, `apps/ontology`, etc.).
2. **Second Use**: Duplicate or keep localized if requirements diverge between the two callers.
3. **Third Use**: When 3 distinct applications or packages require identical behavior, extract into `@tabitha/ui`, `@tabitha/api-client`, or another shared package.

**Types** follow AGENTS.md's `@tabitha/types` boundary rule instead: a type moves there as soon as it crosses an app boundary (imported by 2+ apps, or the shape of another app's API or DB contract, even with one consumer), since two copies of a contract type drift silently at runtime. Types used inside one app stay local.

> For universal code conventions, naming rules, and the complete Development Philosophies, see [AGENTS.md](../../../AGENTS.md).

---

## 4. Pre-Commit Verification Gate

Before submitting code, verify all packages pass the 1-command verification gate:

```bash
bun run precommit
# Runs: bun run check && bun run check:lint && bun run test && bun run build
```

