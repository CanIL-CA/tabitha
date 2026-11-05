import { createContext, type Snippet } from 'svelte'

/** Controls a page can hand to the root layout's header, so they render beside the search box. */
export class HeaderContent {
	current = $state.raw<Snippet | null>(null)
}

export const [get_header_content, set_header_content] = createContext<HeaderContent>()
