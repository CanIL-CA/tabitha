<script lang="ts">
	import type { Snippet } from 'svelte'
	import ThemeSelector from './themes/ThemeSelector.svelte'
	import UpdateNotice from './UpdateNotice.svelte'

	type Props = {
		colors?: string
		children?: Snippet
	}

	// daisyUI's btn-outline/btn-neutral modifiers resolve their resting color against
	// --color-neutral, the same token as this footer's own bg-neutral, so they go invisible here.
	// Plain utilities set real color/border/background properties directly against
	// neutral-content instead, sidestepping that cascade.
	let {
		colors = 'btn-ghost text-neutral-content border border-neutral-content hover:bg-neutral-content hover:text-neutral',
		children,
	}: Props = $props()
</script>

<footer class="footer footer-horizontal mt-20 max-w-none bg-neutral p-10 text-neutral-content">
	<nav>
		<ThemeSelector {colors} />
		<!-- Footer is the one layout piece every app includes, so it's the single place to mount this. -->
		<UpdateNotice />
	</nav>

	{#if children}
		<nav class="justify-self-end">
			{@render children()}
		</nav>
	{/if}
</footer>
