<script lang="ts">
	import type { Reference } from '@tabitha/types'
	import type { NavData } from '#lib/types.js'
	import ReferenceSelectDialog from '#lib/ReferenceSelectDialog.svelte'
	type Props = {
		nav_data: NavData
		url_end?: string
	}
	let { nav_data, url_end='' }: Props = $props()

	let is_dialog_open = $state(false)

	function create_reference_string({ id_primary, id_secondary, id_tertiary }: Reference) {
		return `${id_primary} ${id_secondary}:${id_tertiary}`
	}

	function create_url({ type, id_primary, id_secondary, id_tertiary }: Reference) {
		return `/${type}/${id_primary}/${id_secondary}/${id_tertiary}${url_end}`
	}
</script>

<div class="flex join">
	{#if nav_data.previous}
		<a href="{create_url(nav_data.previous)}" title="{create_reference_string(nav_data.previous)}" target="_self" class="btn btn-md join-item text-xl">
			«
		</a>
	{/if}

	<button
		type="button"
		title="Go to reference"
		onclick={() => is_dialog_open = true}
		class="btn btn-md join-item px-5 bg-base-200 border-base-300 text-2xl font-bold"
	>
		{create_reference_string(nav_data.current)}
	</button>

	{#if nav_data.next}
		<a href="{create_url(nav_data.next)}" title="{create_reference_string(nav_data.next)}" target="_self" class="btn btn-md join-item text-xl">
			»
		</a>
	{/if}
</div>

{#if is_dialog_open}
	<ReferenceSelectDialog
		current={nav_data.current}
		{create_url}
		onclose={() => is_dialog_open = false}
	/>
{/if}
