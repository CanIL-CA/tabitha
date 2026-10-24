<script lang="ts">
	import Icon from '@iconify/svelte'
	import type { Option, Options } from '#lib/types.js'
	import type { ContextArgumentName } from '@tabitha/types'

	type Props = {
		name: ContextArgumentName
		description?: string
		options: Options
		selected?: Option
		onselect: (option: Option) => void
	}

	let { name, description, options, selected, onselect }: Props = $props()

	let first_option = $derived([...options][0] ?? 'Any')
</script>

<fieldset class="fieldset">
	<legend class="fieldset-legend text-info-content">
		{name}
		{#if description}
			<span data-tip={description} class="tooltip tooltip-bottom tooltip-start font-normal">
				<button type="button" aria-label="What {name} means" class="cursor-help">
					<Icon icon="mdi:help-circle" class="h-4 w-4" />
				</button>
			</span>
		{/if}
	</legend>

	<select
		value={selected ?? first_option}
		onchange={e => onselect(e.currentTarget.value)}
		class="select text-base-content"
	>
		{#each [...options] as option}
			<option value={option}>{option}</option>
		{/each}
	</select>
</fieldset>
