<script lang="ts">
	import Icon from '@iconify/svelte'
	import { save_state } from '.'

	type Props = {
		content: string
		classes?: string
	}

	let { content, classes = '' }: Props = $props()

	let is_saved = $derived(content !== '' && save_state.value === content)

	function save() {
		save_state.set(content)
	}
</script>

{#if is_saved}
	<button type="button" class="btn btn-success {classes}" class:btn-warning={!is_saved}>
		Saved in this browser

		<Icon icon="mdi:content-save-check" class="h-6 w-6" />
	</button>
{:else}
	<button type="button" onclick={ save } class="btn btn-warning {classes}">
		Save to this browser

		<Icon icon="mdi:content-save" class="h-6 w-6" />
	</button>
{/if}