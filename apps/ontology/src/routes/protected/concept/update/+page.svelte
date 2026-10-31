<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import type { PageProps } from './$types'
	import { Category } from '#lib/card/categorization/edit/index.js'
	import { levels } from '#lib/lookups.js'
	import { level_gloss_labels, apply_gloss_label, relabel_gloss_for_level } from '#lib/concept_form/gloss_labels.js'
	import { create_fallback_concept } from '#lib/transformers.js'
	import Icon from '@iconify/svelte'
	import Header from '#lib/card/Header.svelte'
	import PendingChange from '#lib/changes/PendingChange.svelte'
	import ChangeDiffData from '#lib/changes/ChangeDiffData.svelte'
	import { Toast } from '@tabitha/ui'
	import { enqueue } from '#lib/offline/sync.js'
	import { check_for_pending_change } from '#lib/offline/pending.js'
	import { diff_change_fields } from '#lib/changes/changes.js'
	import type { ConceptUpdateData, SaveResult } from '#lib/types.js'

	let { data }: PageProps = $props()

	// svelte-ignore state_referenced_locally
	let concept_data = $state(data.concept_data)
	let initial_data = $state.snapshot(concept_data)
	let is_dirty = $derived(!deep_equal({ obj1: concept_data, obj2: initial_data }))
	let concept_for_header = $derived(create_fallback_concept(concept_data))
	let suggested_changes = $derived(data.original_data && diff_change_fields({ change_data: concept_data, current_data: data.original_data }))

	let gloss_labels = $derived(level_gloss_labels[concept_data.level] ?? [])

	let saving = $state(false)
	let error_message = $state('')
	let unsynced_loaded = $state(false)

	onMount(() => {
		// the form already holds the suggestion being edited, which an unrelated unsynced edit shouldn't replace
		if (data.change_id) return

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

	function set_level(level: string) {
		concept_data.level = level
		concept_data.gloss = relabel_gloss_for_level({ gloss: concept_data.gloss, level })
	}

	function set_gloss_label(label: string) {
		concept_data.gloss = apply_gloss_label({ gloss: concept_data.gloss, label })
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
			const outcome = await enqueue({ action: 'update', body: { ...$state.snapshot(concept_data), change_id: data.change_id } })

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

		{#if data.change_id}
			<section role="alert" class="alert alert-info alert-soft flex flex-col items-start gap-2">
				<div class="flex items-center gap-2">
					<Icon icon="mdi:information-outline" class="h-5 w-5" />
					<span>You're editing a suggested change. Saving updates the suggestion, which still needs approval.</span>
				</div>
				{#if suggested_changes && Object.keys(suggested_changes).length > 0}
					<div class="pl-8 text-sm">
						<span class="font-semibold">Changes from the current concept:</span>
						<div class="pl-5">
							<ChangeDiffData change={{ data: suggested_changes, concept: concept_data }} />
						</div>
					</div>
				{:else}
					<span class="pl-7 text-sm">This suggestion no longer changes anything from the current concept.</span>
				{/if}
			</section>
		{/if}

		{#if data.pending_changes.length > 0}
			<section role="alert" class="alert alert-warning alert-soft flex flex-col items-start gap-2">
				<div class="flex items-center gap-2">
					<Icon icon="mdi:alert-outline" class="h-5 w-5" />
					<span>This concept already has changes waiting to be applied. Check your edit doesn't conflict with them.</span>
				</div>
				{#each data.pending_changes as change}
					<PendingChange {change}>
						<ChangeDiffData {change} />
					</PendingChange>
				{/each}
			</section>
		{/if}

		<form onsubmit={handle_submit} class="flex flex-col gap-6">
			<section class="flex flex-col gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Level</legend>
					<select name="level" bind:value={() => concept_data.level, set_level} class="select select-bordered w-24">
						{#each levels.keys().filter(k => k !== '0') as level}
							<option value={level}>{level}</option>
						{/each}
					</select>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Gloss</legend>
					{#if gloss_labels.length > 0}
						<div class="flex flex-wrap items-center gap-2">
							<span class="label text-xs text-accent">Should start with a label appropriate for a level {concept_data.level} concept:</span>
							{#each gloss_labels as label}
								<button
									type="button"
									onclick={() => set_gloss_label(label)}
									class={['btn btn-xs', concept_data.gloss.startsWith(label) ? 'btn-accent' : 'btn-outline']}
								>
									{label}
								</button>
							{/each}
						</div>
					{/if}
					<textarea name="gloss" bind:value={concept_data.gloss} class="textarea textarea-bordered field-sizing-content w-full" rows="2"></textarea>
				</fieldset>
			</section>

			<section class="flex flex-col gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Brief gloss</legend>
					<input name="brief_gloss" bind:value={concept_data.brief_gloss} class="input input-bordered w-full max-w-md" />
					<p class="label text-xs text-accent">optional - a one or two word description for stems with lots of senses</p>
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
				<a href={data.change_id ? '/protected/changes' : `/?q=${concept_data.stem}`} class="btn btn-ghost">Cancel</a>
			</div>
		</form>

	</div>
</article>
