<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity'
	import { fade } from 'svelte/transition'
	import { derive_filters } from '.'
	import { testament } from '@tabitha/types/patterns'
	import BibleFilter from './BibleFilter.svelte'
	import Filter from './Filter.svelte'
	import type { Concept, FilterMap, Option } from '#lib/types.js'
	import type { ContextArgumentName, ConceptExample } from '@tabitha/types'

	type Props = {
		concept: Concept
		examples: ConceptExample[]
		ondatafiltered?: (filtered_examples: ConceptExample[]) => void
	}

	let { concept, examples, ondatafiltered }: Props = $props()

	const FADE_CHARACTERISTICS = {
		delay: 100,
		duration: 700,
	}

	let filters: FilterMap = $derived(derive_filters({ concept, examples }))
	let selected_filters = new SvelteMap<ContextArgumentName, Option>()

	let filtered_examples = $derived(apply_filters({ examples_list: examples, filter_rules: selected_filters }))

	$effect(() => {
		ondatafiltered?.(filtered_examples)
	})

	function apply_filters({ examples_list = [], filter_rules }: { examples_list?: ConceptExample[], filter_rules: Map<ContextArgumentName, Option> }): ConceptExample[] {
		return examples_list.filter(is_a_match)

		function is_a_match(example: ConceptExample): boolean {
			for (const [name, option] of filter_rules.entries()) {
				if (option === 'Any') continue
				if (example.context[name] === option) continue
				if (example.reference.id_primary === option) continue
				if (testament(example.reference.id_primary) === option) continue
				if (option === 'Present' && example.context[name]) continue
				if (option === 'Not present' && !example.context[name]) continue
				return false
			}
			return true
		}
	}
</script>

<section class="flex flex-col">
	<form class="flex gap-4 bg-info text-info-content px-4 pt-2 pb-3.5 overflow-x-auto rounded-box">
		{#each filters as [name, options]}
			{#if name === 'Book'}
				<BibleFilter
					{options}
					selected={selected_filters.get(name)}
					onselect={option => selected_filters.set(name, option)}
				/>
			{:else}
				<Filter
					{name}
					{options}
					selected={selected_filters.get(name)}
					onselect={option => selected_filters.set(name, option)}
				/>
			{/if}
		{/each}
	</form>

	{#if filtered_examples.length > 0 && filtered_examples.length < examples.length}
		<aside transition:fade={FADE_CHARACTERISTICS} class="alert alert-info mt-2">
			<span>
				Matched
				<span class="font-mono">{filtered_examples.length}</span>
				{filtered_examples.length === 1 ? 'example' : 'examples'}
			</span>
		</aside>
	{/if}
</section>
