<script lang="ts">
	import { semantic_category } from '#lib/lookups.js'
	import type { PartOfSpeech } from '@tabitha/types'

	type Props = {
		part_of_speech: PartOfSpeech
		categories?: string[]
	}

	let { part_of_speech, categories = $bindable([]) }: Props = $props()

	let category_map = $derived(semantic_category[part_of_speech])
	let category_options = $derived(category_map ? Object.values(category_map) : [])
</script>

<fieldset class="fieldset border border-base-300 rounded-box p-4">
	<legend class="fieldset-legend font-semibold">Semantic category</legend>

	<select bind:value={categories[0]} name="categories[]" class="select">
		{#each category_options as category}
			<option value={category}>{category}</option>
		{/each}
	</select>
</fieldset>
