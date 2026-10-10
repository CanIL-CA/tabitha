<script lang="ts">
	import type { OntologyChange } from '#lib/types.js'
	import type { PartOfSpeech } from '@tabitha/types'

	type Props = {
		change: OntologyChange
	}

	let { change }: Props = $props()

	function categories_display({ part_of_speech, value, old }: { part_of_speech: PartOfSpeech, value: string[], old: string[] | undefined }) {
		if (!old) {
			// this was a 'create' action
			return value.filter(v => !!v && !v.startsWith('never')).join(' | ')
		}

		if (part_of_speech === 'Verb') {
			// old and value always have all the category slots, even if empty string.
			// For Verbs it's nice to see ALL the non-empty categories, whereas the other parts of speech can just show the diffs.
			const new_values = value.filter(v => !!v)
			const old_values = old.filter(v => !!v)
			return `${old_values.length ? old_values.join(' | ') : 'none'} → ${new_values.join(' | ')}`
		}

		if (old.length === 0) {
			return `none → ${value.filter(v => !!v && !v.startsWith('never')).join(' | ')}`
		}

		const display_parts: string[] = []
		for (let i = 0; i < value.length; i++) {
			if (value[i] !== old[i]) {
				display_parts.push(`'${old[i]}' → '${value[i]}'`)
			}
		}
		return display_parts.join(' | ')
	}
</script>

<ul class="list list-disc">
	{#if change.data.level}
		{@const { value, old } = change.data.level}
		<li><span class="font-semibold">Level</span>: {old ? `${old} → ${value}` : value}</li>
	{/if}
	{#if change.data.gloss}
		{@const { value, old } = change.data.gloss}
		<li><span class="font-semibold">Gloss</span>: {old !== undefined ? `'${old}' → '${value}'` : value}</li>
	{/if}
	{#if change.data.brief_gloss}
		{@const { value, old } = change.data.brief_gloss}
		<li><span class="font-semibold">Brief gloss</span>: {old !== undefined ? `'${old}' → '${value}'` : value}</li>
	{/if}
	{#if change.data.categories}
		{@const { value, old } = change.data.categories}
		{@const part_of_speech = change.concept.part_of_speech}
		{@const label = part_of_speech === 'Verb' ? 'Theta grid' : 'Categorization'}
		<li><span class="font-semibold">{label}</span>: {categories_display({ part_of_speech, value, old })}</li>
	{/if}
	{#if change.data.curated_examples}
		<li><span class="font-semibold">Curated examples</span> updated</li>
	{/if}
</ul>
