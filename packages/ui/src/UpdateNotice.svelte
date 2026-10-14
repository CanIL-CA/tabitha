<script lang="ts">
	import { beforeNavigate } from '$app/navigation'
	import { updated } from '$app/state'
	import { get_ui_messages } from './i18n/ui_messages'

	const messages = get_ui_messages()

	// Picks up a new deployment silently: the next in-app link becomes a full page load instead of
	// a client-side navigation, so the user lands on the new version without being prompted.
	// SvelteKit sets `updated` on its own poll (see version.pollInterval), on server responses, and
	// whenever the tab becomes visible or focused. https://svelte.dev/docs/kit/configuration#version
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href
	})
</script>

<!-- A quiet cue for tabs that rarely navigate; beforeNavigate above already covers
     everyone who clicks a link. -->
{#if updated.current}
	<p class="text-sm">
		{messages.ui_update_available()}
		<button type="button" onclick={() => location.reload()} class="link">
			{messages.ui_refresh()}
		</button>
	</p>
{/if}
