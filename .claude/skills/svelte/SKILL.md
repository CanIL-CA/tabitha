---
name: svelte
description: Official Svelte 5 & SvelteKit 2 development skill. MANDATORY best practices for Svelte 5 (Runes) and SvelteKit 2. TRIGGER when writing, modifying, inspecting, or refactoring any Svelte code, components (.svelte), or Svelte module files (.svelte.js, .svelte.ts).
metadata:
  version: 5.x
---

# Svelte 5 & SvelteKit 2 Best Practices

This document defines mandatory guidelines and code standards for Svelte 5 (Runes) and SvelteKit 2.

**Validate with the Svelte MCP server.** The repo's `.mcp.json` connects the official Svelte server (`mcp.svelte.dev`). After writing or changing a `.svelte` file or a `.svelte.ts`/`.svelte.js` module, run its `svelte-autofixer` tool on the result and resolve what it reports. Its suggestions don't override these repo rules: when one conflicts with a rule below, follow the rule. When unsure of Svelte 5 or SvelteKit syntax, look it up with `list-sections` and `get-documentation` instead of guessing.

---

## 1. Component Props (`$props()`)

- **Always use `$props()`** for declaring component props:
  ```svelte
  <script lang="ts">
    interface Props {
      title: string
      count?: number
      onselect?: (id: string) => void
    }

    let { title, count = 0, onselect }: Props = $props()
  </script>
  ```
- **NO `export let`**: Never use legacy Svelte 3/4 `export let` declarations.
- **Two-Way Binding (`$bindable()`)**: Use `$bindable()` only when two-way binding is explicitly intended by the parent:
  ```svelte
  let { value = $bindable('') } = $props()
  ```

---

## 2. Reactive State (`$state` & `$derived`)

- **Mutable State**: Declare local reactive state with `$state()`:
  ```svelte
  let items = $state<string[]>([])
  let is_open = $state(false)
  ```
- **Derived State**: Compute derived values with `$derived()` or `$derived.by()`:
  ```svelte
  let total_count = $derived(items.length)
  let filtered_items = $derived.by(() => {
    return items.filter(item => item.startsWith('A'))
  })
  ```
- **NO `$: ` Declarations**: Never use legacy `$: ` reactive labels or statements.
- **Side Effects (`$effect`)**: Use `$effect()` only for side effects (DOM updates, external library integration, sync). Do not use `$effect` to sync values that can be calculated with `$derived`.

---

## 3. Templating, Children & Snippets

- **NO `<slot />`**: Never use legacy `<slot />` or named `<slot name="..." />`.
- **Default Content / Children**: Access component children via `$props()` and render with `{@render children()}`:
  ```svelte
  <script lang="ts">
    import type { Snippet } from 'svelte'

    let { children }: { children?: Snippet } = $props()
  </script>

  {#if children}
    {@render children()}
  {/if}
  ```
- **Custom Snippets**: Use `{#snippet name(arg)}` and `{@render name(arg)}` for custom content templates:
  ```svelte
  {#snippet header(text: string)}
    <h2 class="text-xl font-bold">{text}</h2>
  {/snippet}

  {@render header('Title')}
  ```

---

## 4. Event Handling & Communication

- **Standard DOM Attributes**: Use native lower-case HTML event properties (`onclick`, `oninput`, `onkeydown`, `onsubmit`, `onmouseenter`, `onmouseleave`):
  ```svelte
  <button onclick={handle_click} onmouseenter={handle_hover}>Click</button>
  ```
- **NO `on:click` Directives**: Do not use `on:click`, `on:input`, or other legacy `on:*` directives.
- **NO `createEventDispatcher`**: Do not use `createEventDispatcher`. Pass callback function props instead:
  ```svelte
  <script lang="ts">
    let { onclose }: { onclose: (saved: boolean) => void } = $props()
  </script>

  <button onclick={() => onclose(true)}>Save</button>
  ```

---

## 5. Global & Shared State Modules (`.svelte.ts` / `.svelte.js`)

- Place shared reactive state in `.svelte.ts` or `.svelte.js` files using class instances or state objects:
  ```ts
  // user_state.svelte.ts
  class UserStore {
    user = $state<User | null>(null)
    is_authenticated = $derived(this.user !== null)

    set_user(new_user: User) {
      this.user = new_user
    }
  }

  export const user_store = new UserStore()
  ```
- Use `$state.raw()` for large immutable objects or third-party class instances that do not need deep reactivity.
- Use `$state.snapshot()` when taking non-reactive copies of reactive objects.
- **NO `svelte/store`**: Do not use legacy Svelte stores (`writable`, `readable`, `derived`) for new code.

---

## 6. Dynamic Components

- Render dynamic components using uppercase variable names directly:
  ```svelte
  <script lang="ts">
    import ComponentA from './ComponentA.svelte'
    import ComponentB from './ComponentB.svelte'

    let { type }: { type: 'a' | 'b' } = $props()
    let Component = $derived(type === 'a' ? ComponentA : ComponentB)
  </script>

  <Component />
  ```
- **NO `<svelte:component>`**: Do not use `<svelte:component this={...}>`.

---

## 7. SvelteKit 2 Integration

- **Page Loader Data**: In `+page.svelte`, receive page loader data via `$props()`:
  ```svelte
  <script lang="ts">
    let { data } = $props()
  </script>
  ```
- **Syncing Route Changes**: If component state depends on loader data, use `$derived(data.foo)` or update reactive state when loader data changes. Avoid assigning `$state(data.foo)` without a mechanism to update state when route navigation changes `data`.
- **Page & State Runes**: Use `import { page } from '$app/state'` for modern SvelteKit 2 page state access instead of legacy `$app/stores`.
- **Navigation**: Use `import { goto } from '$app/navigation'`.
