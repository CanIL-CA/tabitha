<script lang="ts">
	import Icon from '@iconify/svelte'
	import Header from './Header.svelte'
	import SimplificationHints from './SimplificationHints.svelte'
	import PendingChange from '#lib/PendingChange.svelte'
	import { Category } from './categorization'
	import { DetailedCard, Meaning } from '#lib/index.js'
	import { page } from '$app/state'
	import { CONCEPT_FILTERS } from '#lib/filters.js'
	import type { Concept } from '#lib/types.js'

	type Props = {
		concept: Concept
		show_how_to?: boolean
	}

	let { concept, show_how_to = false }: Props = $props()

	let expanded = $state(false)
	function expand() {
		expanded = true
	}
	function close() {
		expanded = false
	}
</script>

<article class="card card-border grow shadow-md">
	<div class="card-body">
		<section class="card-title justify-between">
			<Header {concept} />
		</section>

		<section class="prose max-w-none">
			<Meaning {concept} />
		</section>

		{#if concept.part_of_speech === 'Verb' && CONCEPT_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(concept)}
			{@const { part_of_speech, categories } = concept}
			{@const pending_categories_change = concept.pending_changes.find(change => change.data.categories)}
			<section class="prose mt-4 max-w-none">
				<Category {part_of_speech} {categories} />

				{#if pending_categories_change}
					{@const pending_categories = pending_categories_change.data.categories?.value.filter(category => category) || []}
					<PendingChange change={pending_categories_change}>
						<Category {part_of_speech} categories={pending_categories} />
					</PendingChange>
				{/if}
			</section>
		{/if}

		{#if show_how_to && (concept.how_to_hints.length > 0 || CONCEPT_FILTERS.IS_COMPLEX(concept))}
			<section class="prose mt-4 max-w-none">
				<h3 class="mb-0">Suggestions for how to handle</h3>
				<SimplificationHints {concept} />
			</section>
		{/if}

		<section class="card-actions mt-4 justify-end">
			{#if CONCEPT_FILTERS.IS_IN_ONTOLOGY(concept) && page.data.can_update}
				<a title="Edit" href="protected/concept/update?concept={concept.stem}-{concept.sense}-{concept.part_of_speech}" class="btn btn-sm">
					<Icon icon="mdi:edit-outline" class="h-5 w-5" />
				</a>
			{/if}
			<button onclick={expand} class="btn btn-primary btn-sm">
				EXPAND <Icon icon="gg:maximize-alt" class="h-4 w-4" />
			</button>
		</section>
	</div>
</article>

{#if expanded}
	<DetailedCard {concept} onclose={close} />
{/if}
