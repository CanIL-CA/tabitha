<script lang="ts">
	import Icon from '@iconify/svelte'
	import { goto } from '$app/navigation'
	import type { PageProps } from './$types'
	import { Category } from '#lib/card/categorization/edit/index.js'
	import { default_categories, levels, parts_of_speech } from '#lib/lookups.js'
	import { create_fallback_concept } from '#lib/transformers.js'
	import { get_next_sense } from '#lib/changes.js'
	import Header from '#lib/card/Header.svelte'
	import { Toast } from '@tabitha/ui'
	import { enqueue } from '#lib/offline/sync.js'
	import type { SaveResult } from '#lib/types.js'

	let { data }: PageProps = $props()

	// svelte-ignore state_referenced_locally
	let concept_data = $state(data.concept_data)
	let can_save = $derived(concept_data.stem && concept_data.sense && concept_data.part_of_speech)

	let debounced_stem_pos = $state({ stem: concept_data.stem, part_of_speech: concept_data.part_of_speech })
	let debounce_delay = 500
	let fetching_sense = $state(false)

	let saving = $state(false)
	let error_message = $state('')

	function dismiss_toast() {
		error_message = ''
	}

	async function handle_submit(event: SubmitEvent) {
		event.preventDefault()
		saving = true
		dismiss_toast()

		try {
			const outcome = await enqueue({ action: 'create', body: $state.snapshot(concept_data) })

			if (outcome.type === 'failed') {
				error_message = outcome.message
			} else {
				let save_result: SaveResult
				if (outcome.type === 'still_pending') {
					save_result = 'queued'
				} else {
					save_result = outcome.applied ? 'applied' : 'pending'
				}
				goto('/protected/changes', { state: { save_result } })
			}
		} catch (err: unknown) {
			error_message = err instanceof Error ? err.message : 'Failed to create the concept.'
		} finally {
			saving = false
		}
	}

	$effect(() => {
		concept_data.categories = default_categories[concept_data.part_of_speech]?.slice() ?? []
	})

	$effect(() => {
		// the timer prevents a fetch request from being sent on every keystroke
		debounced_stem_pos = { stem: concept_data.stem, part_of_speech: concept_data.part_of_speech }
		fetching_sense = true

		const timer = setTimeout(async () => {
			const { stem, part_of_speech } = debounced_stem_pos
			if (!stem || !part_of_speech) {
				fetching_sense = false
				return
			}

			try {
				concept_data.sense = await get_next_sense({ stem, part_of_speech })
			} catch (err) {
				console.error({ err })
			} finally {
				fetching_sense = false
			}
		}, debounce_delay)

		return () => clearTimeout(timer)
	})
</script>

{#if error_message}
	<Toast variant="error" on_dismiss={dismiss_toast}>{error_message}</Toast>
{/if}

<article class="card bg-base-200 mx-auto w-[80%]">
	<div class="card-body">
		<div class="prose pb-4">
			<h2>Add a new concept</h2>
		</div>

		{#if concept_data.sense}
			{@const concept_for_header = create_fallback_concept(concept_data)}
			<section class="card-title justify-between">
				<Header concept={concept_for_header} />
			</section>
		{:else if fetching_sense}
			<div>
				<Icon icon="line-md:loading-twotone-loop" class="h-5 w-5 text-warning" />
			</div>
		{/if}

		<form onsubmit={handle_submit} class="flex flex-col gap-6">
			<section class="flex flex-wrap gap-4 items-end">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Stem</legend>
					<input name="stem" bind:value={concept_data.stem} class="input input-bordered" required />
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Part of speech</legend>
					<select name="part_of_speech" bind:value={concept_data.part_of_speech} class="select select-bordered" required>
						{#each parts_of_speech as pos}
							<option value={pos}>{pos}</option>
						{/each}
					</select>
				</fieldset>

				<input name="sense" type="hidden" bind:value={concept_data.sense} />

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Level</legend>
					<select name="level" bind:value={concept_data.level} class="select select-bordered w-24">
						{#each levels.keys() as level}
							<option value={level}>{level}</option>
						{/each}
					</select>
				</fieldset>

				{#if concept_data.sense && concept_data.sense !== 'A'}
					<a href={`/?q=${concept_data.stem}&category=${concept_data.part_of_speech}`} target="_blank" class="link link-accent link-hover text-sm flex items-center gap-1 pb-2">
						view other senses
						<Icon icon="fe:link-external" class="h-4 w-4" />
					</a>
				{/if}
			</section>

			<section class="flex flex-col gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Gloss</legend>
					<textarea name="gloss" bind:value={concept_data.gloss} class="textarea textarea-bordered field-sizing-content w-full" rows="2"></textarea>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Brief gloss</legend>
					<input name="brief_gloss" bind:value={concept_data.brief_gloss} class="input input-bordered w-full max-w-md" />
					<p class="label text-xs text-accent">optional - for stems with lots of senses</p>
				</fieldset>
			</section>

			<section>
				<Category part_of_speech={concept_data.part_of_speech} bind:categories={concept_data.categories} />
			</section>

			<div class="flex gap-2">
				<button type="submit" disabled={!can_save || saving} class="btn btn-primary">
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Save
				</button>
				<a href="/" class="btn btn-ghost">Cancel</a>
			</div>
		</form>

	</div>
</article>
