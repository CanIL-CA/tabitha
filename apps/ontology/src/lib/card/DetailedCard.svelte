<script lang="ts">
	import { onMount } from 'svelte'
	import Icon from '@iconify/svelte'
	import { Details, Examples, Meaning } from '#lib/index.js'
	import Header from './Header.svelte'
	import SimplificationHints from './SimplificationHints.svelte'
	import PendingChange from '#lib/PendingChange.svelte'
	import { Category } from './categorization'
	import { CONCEPT_FILTERS } from '#lib/filters.js'
	import SimplifiedEntities from '#lib/examples/curated_examples/SimplifiedEntities.svelte'
	import type { Concept } from '#lib/types.js'
	import type { PartOfSpeech } from '@tabitha/types'

	type Props = {
		concept: Concept
		onclose?: () => void
	}

	let { concept, onclose }: Props = $props()

	let dialog = $state<HTMLDialogElement>()

	onMount(() => dialog?.showModal())

	let curated_examples = $derived(concept.curated_examples)
</script>

<!-- https://daisyui.com/components/modal -->
<dialog bind:this={dialog} onclose={onclose} class="modal">
	<section class="modal-box max-w-none">
		<form method="dialog">
			<button class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2">
				<Icon icon="material-symbols:close" class="h-4 w-4" />
			</button>
		</form>

		<article class="card">
			<div class="card-body">
				<section class="card-title justify-between">
					<Header {concept} />
				</section>

				<section class="prose max-w-none">
					<Meaning {concept} />
				</section>

				{#if CONCEPT_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(concept)}
					{@const part_of_speech = concept.part_of_speech as PartOfSpeech}
					{@const pending_categories_change = concept.pending_changes.find(change => change.data.categories)}
					<section class="prose mt-4 max-w-none">
						<Category {part_of_speech} categories={concept.categories} />

						{#if pending_categories_change}
							{@const pending_categories = pending_categories_change.data.categories?.value.filter(category => category) || []}
							<PendingChange change={pending_categories_change}>
								<Category {part_of_speech} categories={pending_categories} />
							</PendingChange>
						{/if}
					</section>
				{/if}

				{#if curated_examples.length > 0 && CONCEPT_FILTERS.IS_IN_ONTOLOGY(concept)}
					<section class="prose mt-4 max-w-none">
						{#snippet curated_summary()}
							<span>
								Curated examples ({curated_examples.length})
							</span>
						{/snippet}

						<Details colors="bg-base-200" summary={curated_summary}>
							{#each curated_examples as { sentence, reference, encoding }}
								<blockquote class="mb-0">
									<span>
										{sentence}
									</span>
									<cite data-tip="Source: {reference.type}" class="tooltip tooltip-right tooltip-info block w-fit text-start text-xs">
										({reference.id_primary}
										{reference.id_secondary}:{reference.id_tertiary})
									</cite>

									<footer class="mt-4 px-4 flex gap-2 justify-left bg-base-100">
										<SimplifiedEntities entities={encoding} />
									</footer>
								</blockquote>
							{/each}
						</Details>
					</section>
				{/if}

				{#if concept.how_to_hints.length > 0 || CONCEPT_FILTERS.IS_COMPLEX(concept)}
					<section class="prose mt-4 max-w-none">
						<h3 class="mb-0">Suggestions for how to handle</h3>
						<SimplificationHints {concept} />
					</section>
				{/if}

				{#if CONCEPT_FILTERS.IS_IN_ONTOLOGY(concept)}
					<section class="prose mt-4 max-w-none">
						<h3>Examples</h3>
						<Examples {concept} />
					</section>
				{/if}
			</div>
		</article>
	</section>

	<form method="dialog" class="modal-backdrop">
		<button>Close</button>
	</form>
</dialog>
