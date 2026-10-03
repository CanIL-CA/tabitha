---
name: vitest
description: Fast in-memory unit testing skill with Vitest 3. MANDATORY when writing, refactoring, fixing, or reviewing unit tests (*.test.ts) across apps and packages. Enforces pure in-memory testing without network or database dependencies.
metadata:
  version: 3.x
---

# Vitest Unit Testing Best Practices

Guidelines for writing ultra-fast, deterministic, pure in-memory unit tests across the TaBiThA monorepo.

---

## 1. The Pure In-Memory Testing Philosophy

- **Zero Network Calls**: Never make live HTTP/fetch requests in unit tests. Mock external services with `vi.fn()` or in-memory fixtures.
- **Zero Live Database Connections**: Never connect to live D1 or external SQLite files in unit tests. Test pure logic, parsers, and data transformations in memory. (Use Playwright E2E for full database integration tests).
- **Execution Target**: Keep the workspace unit suite (`bun run test:unit`) fast enough to run on every change; a test that needs the network or a database belongs in Playwright.

---

## 2. Table-Driven Parameterized Tests (`test.each`)

Use `test.each` for linguistic parser rules, morphological inflections, and validation checks:

```typescript
import { describe, expect, test } from 'vitest'
import { parse_clause } from './parser'

describe('parse_clause', () => {
	test.each([
		['Paul write-01 letter', { subject: 'Paul', verb: 'write-01', object: 'letter' }],
		['God love-01 world', { subject: 'God', verb: 'love-01', object: 'world' }],
		['Jesus speak-01 truth', { subject: 'Jesus', verb: 'speak-01', object: 'truth' }],
	])('correctly parses "%s"', (input, expected) => {
		const result = parse_clause(input)
		expect(result).toEqual(expected)
	})
})
```

---

## 3. Mocking Dependencies with `vi.fn()` & `vi.spyOn()`

Mock external modules or helper functions cleanly:

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fetch_concept_details } from './concept_service'

describe('fetch_concept_details', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test('formats API response properly', async () => {
		const mock_response = { id: 'write-01', gloss: 'to compose text' }
		vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock_response)))

		const data = await fetch_concept_details('write-01')
		expect(data.id).toBe('write-01')
		expect(fetch).toHaveBeenCalledTimes(1)
	})
})
```

---

## 4. Testing Svelte 5 Runes & Reactive State

When testing Svelte 5 rune modules (`.svelte.ts` / `.svelte.js`):
- Run tests in a node or happy-dom environment.
- Test state transitions directly on rune-managed classes and state containers.
