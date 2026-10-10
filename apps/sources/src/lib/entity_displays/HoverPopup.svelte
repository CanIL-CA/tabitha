<script lang="ts">
	import { view_settings } from '#lib/settings/settings.svelte.js'

	let { dropdown_content, button_content } = $props()
	
	let container_el = $state<HTMLElement | null>(null)
	let align_end = $state(false)

	let entity_container_el = $derived(document.getElementById('entity-container'))

	// Dynamically align dropdown if near the right screen edge to prevent horizontal overflow and layout shifts
	function check_position() {
		if (container_el) {
			const rect = container_el.getBoundingClientRect()
			const container_right = entity_container_el?.getBoundingClientRect().right ?? window.innerWidth
			align_end = rect.right > container_right - 320
		}
	}
</script>

{#if view_settings.show_hover_popups}
	<div
		bind:this={container_el}
		onmouseenter={check_position}
		onfocusin={check_position}
		role="none"
		class="card dropdown dropdown-hover dropdown-bottom {align_end ? 'dropdown-end' : ''}"
	>
		<div class="overflow-x-auto dropdown-content z-50 text-sm p-2 shadow-xl rounded-box w-96 text-base-content bg-base-100 max-w-[calc(100vw-2rem)] tracking-normal mt-2 -ms-1">
			{@render dropdown_content()}
		</div>
		<div>
			{@render button_content()}
		</div>
	</div>
{:else}
	{@render button_content()}
{/if}
