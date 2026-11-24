<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import Icon from '@iconify/svelte'
	import { edit_curated_example_url } from '#lib/curated_example/links.js'
	import { Examples } from '#lib/examples/index.js'
	import Details from './Details.svelte'
	import Meaning from './Meaning.svelte'
	import Header from './Header.svelte'
	import SimplificationHints from './SimplificationHints.svelte'
	import PendingChange from '#lib/changes/PendingChange.svelte'
	import { Category } from './categorization'
	import { CONCEPT_FILTERS } from '#lib/search/filters.js'
	import { structure_curated_example_encoding } from '#lib/transformers.ts'
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
							{#each curated_examples as { sentence, reference, encoding }, index}
								{@const structured_entities = structure_curated_example_encoding(encoding)}
								<blockquote class="mb-0">
									<div class="flex items-start gap-2">
										{#if page.data.user?.permissions.has_protected_access}
											<a title="Edit this curated example" href={edit_curated_example_url({ concept, index })} class="btn btn-xs btn-ghost not-prose">
												<Icon icon="mdi:edit-outline" class="h-4 w-4" />
											</a>
										{/if}

										<div>
											<span>
												{sentence}
											</span>
											<cite data-tip="Source: {reference.type}" class="tooltip tooltip-right tooltip-info block w-fit text-start text-xs">
												({reference.id_primary}
												{reference.id_secondary}:{reference.id_tertiary})
											</cite>
										</div>
									</div>

									<footer class="mt-4 px-4 flex justify-left bg-base-100">
										<SimplifiedEntities entities={structured_entities} />
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
