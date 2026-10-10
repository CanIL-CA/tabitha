<script lang="ts">
	import type { Option, Options } from '#lib/types.js'
	import type { ContextArgumentName } from '@tabitha/types'

	type Props = {
		name: ContextArgumentName
		options: Options
		selected?: Option
		onselect: (option: Option) => void
	}

	let { name, options, selected, onselect }: Props = $props()

	let first_option = $derived([...options][0] ?? 'Any')
</script>

<fieldset class="fieldset">
	<legend class="fieldset-legend text-info-content">{name}</legend>

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
