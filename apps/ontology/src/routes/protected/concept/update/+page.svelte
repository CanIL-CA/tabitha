<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import type { PageProps } from './$types'
	import { Category } from '#lib/card/categorization/edit/index.js'
	import { levels } from '#lib/lookups.js'
	import { create_fallback_concept } from '#lib/transformers.js'
	import Header from '#lib/card/Header.svelte'
	import { Toast } from '@tabitha/ui'
	import { enqueue } from '#lib/offline/sync.js'
	import { check_for_pending_change } from '#lib/offline/pending.js'
	import type { Concept, ConceptUpdateData, SaveResult } from '#lib/types.js'

	let { data }: PageProps = $props()

	// svelte-ignore state_referenced_locally
	let concept_data = $state(data.concept_data)
	let initial_data = $state.snapshot(concept_data)
	let is_dirty = $derived(!deep_equal({ obj1: concept_data, obj2: initial_data }))
	let concept_for_header: Concept = $derived(create_fallback_concept(concept_data))

	let saving = $state(false)
	let error_message = $state('')
	let unsynced_loaded = $state(false)

	onMount(() => {
		check_for_pending_change(concept_data).then(mutation => {
			if (!mutation) return

			Object.assign(concept_data, mutation.body)
			initial_data = $state.snapshot(concept_data)
			unsynced_loaded = true
		})
	})

	function deep_equal({ obj1, obj2 }: { obj1: ConceptUpdateData, obj2: ConceptUpdateData }): boolean {
		return JSON.stringify(obj1) === JSON.stringify(obj2)
	}

	function dismiss_toast() {
		error_message = ''
		unsynced_loaded = false
	}

	async function handle_submit(event: SubmitEvent) {
		event.preventDefault()
		saving = true
		dismiss_toast()

		try {
			const outcome = await enqueue({ action: 'update', body: $state.snapshot(concept_data) })

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
			error_message = err instanceof Error ? err.message : 'Failed to save the concept.'
		} finally {
			saving = false
		}
	}
</script>

{#if error_message}
	<Toast variant="error" on_dismiss={dismiss_toast}>{error_message}</Toast>
{:else if unsynced_loaded}
	<Toast variant="info" on_dismiss={dismiss_toast}>
		Showing your unsynced edit from this device — it hasn't been sent to the server yet.
	</Toast>
{/if}

<article class="card bg-base-200 mx-auto w-[80%]">
	<div class="card-body">
		<section class="card-title justify-between">
			<Header concept={concept_for_header} />
		</section>

		<form onsubmit={handle_submit} class="flex flex-col gap-6">
			<section class="flex flex-col gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Level</legend>
					<select name="level" bind:value={concept_data.level} class="select select-bordered w-24">
						{#each levels.keys() as level}
							<option value={level}>{level}</option>
						{/each}
					</select>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Gloss</legend>
					<textarea name="gloss" bind:value={concept_data.gloss} class="textarea textarea-bordered field-sizing-content w-full" rows="2"></textarea>
				</fieldset>
			</section>

			<section class="flex flex-col gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Brief gloss</legend>
					<input name="brief_gloss" bind:value={concept_data.brief_gloss} class="input input-bordered w-full max-w-md" />
					<p class="label text-xs text-accent">optional - for stems with lots of senses</p>
				</fieldset>

				<Category part_of_speech={concept_data.part_of_speech} bind:categories={concept_data.categories} />

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Curated examples</legend>
					<textarea name="curated_examples" bind:value={concept_data.curated_examples} class="textarea textarea-bordered field-sizing-content w-full" rows="3"></textarea>
				</fieldset>
			</section>

			<div class="flex gap-2">
				<button type="submit" disabled={!is_dirty || saving} class="btn btn-primary">
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Save
				</button>
				<a href="/?q={concept_data.stem}" class="btn btn-ghost">Cancel</a>
			</div>
		</form>

	</div>
</article>
