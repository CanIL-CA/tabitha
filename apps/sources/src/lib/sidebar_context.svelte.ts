import { createContext, type Snippet } from 'svelte'

/**
 * The layout owns the sidebar's shell and open/closed layout; each page fills `content` with the
 * sidebar it wants shown, or leaves it undefined while nothing is selected.
 */
export class SidebarSlot {
	content = $state<Snippet | undefined>()
	is_open = $derived(this.content !== undefined)
}

export const [get_sidebar_slot, set_sidebar_slot] = createContext<SidebarSlot>()
