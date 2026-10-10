<script lang="ts">
	import { onMount } from 'svelte'
	import { fade } from 'svelte/transition'
	import Icon from '@iconify/svelte'
	import { ExampleSummary, Filters, get_examples, SourceData, TargetData } from '#lib/examples/index.js'
	import { book_order_index } from '@tabitha/types/patterns'
	import type { Concept } from '#lib/types.js'
	import type { ConceptKey, ConceptExample, PartOfSpeech } from '@tabitha/types'

	type Props = {
		concept: Concept
	}

	let { concept }: Props = $props()

	let concept_key = $derived<ConceptKey>({ ...concept, part_of_speech: concept.part_of_speech as PartOfSpeech })

	const MAX_EXAMPLES_DISPLAYED = 50

	let loading = $state(true)
	let all_examples = $state<ConceptExample[]>([])
	let filtered_examples = $state<ConceptExample[]>([])
	let displayed_examples = $derived(
		filtered_examples.toSorted((a, b) => book_order_index(a) - book_order_index(b)).slice(0, MAX_EXAMPLES_DISPLAYED),
	)

	async function load_examples() {
		loading = true
		try {
			all_examples = await get_examples(concept_key) ?? []
		} finally {
			loading = false
		}
	}

	onMount(() => {
		load_examples()
	})

	const FADE_CHARACTERISTICS = {
		delay: 100,
		duration: 700,
	}

	let retrieval_queue = $state<number[]>([])

	function handle_queue({ event, id }: { event: Event, id: number }) {
		const details = event.currentTarget as HTMLDetailsElement
		if (details.open) {
			retrieval_queue = [...retrieval_queue, id]
		} else {
			retrieval_queue = retrieval_queue.filter(queued_id => queued_id !== id)
		}
	}
</script>

<article class="bg-base-200 p-4 flex flex-col gap-4">
	<h3 class="text-lg font-bold">Bible</h3>

	{#if loading}
		<span class="loading loading-spinner text-warning"></span>
		loading the examples...
	{:else}
		<Filters {concept} examples={all_examples} ondatafiltered={detail => filtered_examples = detail} />

		{#each displayed_examples as { reference, context, book_status }, i}
			<details
				ontoggle={event => handle_queue({ event, id: i })}
				transition:fade={FADE_CHARACTERISTICS}
				class="collapse collapse-arrow bg-base-100 overflow-visible"
			>
				<summary class="collapse-title border border-base-200">
					<ExampleSummary {reference} {context} {book_status} />
				</summary>

				<section class="collapse-content">
					{#if retrieval_queue.includes(i)}
						<TargetData {reference} />

						<SourceData {reference} selected_concept={concept_key} />
					{/if}
				</section>
			</details>
		{:else}
			No matching examples.
		{/each}

		{#if filtered_examples.length > MAX_EXAMPLES_DISPLAYED}
			<section class="alert alert-warning">
				<Icon icon="ci:triangle-warning" class="h-7 w-7" />

				<span>
					Only showing the first
					<span class="font-mono">{MAX_EXAMPLES_DISPLAYED}</span>
					matching examples.
				</span>
			</section>
		{/if}
	{/if}
</article>

<style>
	/* this corrects a problem where the features popup was getting hidden behind the next details element below it */
	details[open] {
		z-index: 999;
	}
</style>
