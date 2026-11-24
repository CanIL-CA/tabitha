<script lang="ts">
	import { goto } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import { Toast } from '@tabitha/ui'
	import type { PageProps } from './$types'
	import Header from '#lib/card/Header.svelte'
	import { Category } from '#lib/card/categorization/edit/index.js'
	import ChangeDiffData from '#lib/changes/ChangeDiffData.svelte'
	import PendingChange from '#lib/changes/PendingChange.svelte'
	import { CuratedExampleEditor } from '#lib/curated_example/editor.svelte.js'
	import SimplifiedEntities from '#lib/examples/curated_examples/SimplifiedEntities.svelte'
	import { enqueue } from '#lib/offline/sync.js'
	import { create_fallback_concept } from '#lib/transformers.js'
	import type { SaveResult } from '#lib/types.js'

	let { data }: PageProps = $props()

	let editor = $derived(new CuratedExampleEditor({
		concept: data.concept_data,
		categories: data.concept_data.categories,
		curated_examples: data.concept_data.curated_examples,
		reference: data.reference,
		encoding: data.encoding,
		sentence: data.sentence,
		replaces: data.replaces,
	}))

	let concept_for_header = $derived(create_fallback_concept(data.concept_data))
	let categories_label = $derived(data.concept_data.part_of_speech === 'Verb' ? 'case frame' : 'usage')

	let saving = $state(false)
	let error_message = $state('')

	async function handle_save(event: SubmitEvent) {
		event.preventDefault()
		if (!editor.curated_examples_to_save) return

		saving = true
		error_message = ''

		try {
			const body = { ...data.concept_data, categories: $state.snapshot(editor.categories), curated_examples: editor.curated_examples_to_save }
			const outcome = await enqueue({ action: 'update', body })

			if (outcome.type === 'failed') {
				error_message = outcome.message
			} else {
				const save_result: SaveResult = outcome.type === 'still_pending' ? 'queued' : outcome.applied ? 'applied' : 'pending'
				goto('/protected/changes', { state: { save_result } })
			}
		} catch (err: unknown) {
			error_message = err instanceof Error ? err.message : 'Failed to save the curated example.'
		} finally {
			saving = false
		}
	}
</script>

{#if error_message}
	<Toast variant="error" on_dismiss={() => error_message = ''}>{error_message}</Toast>
{/if}

<article class="card bg-base-200 mx-auto w-[80%]">
	<div class="card-body">
		<section class="card-title justify-between">
			<Header concept={concept_for_header} />
		</section>

		<h2 class="text-lg font-semibold">
			{data.replaces === null ? 'Add a curated example' : `Edit curated example ${data.replaces + 1}`}
		</h2>

		{#if data.pending_changes.length > 0}
			<section role="alert" class="alert alert-warning alert-soft flex flex-col items-start gap-2">
				<div class="flex items-center gap-2">
					<Icon icon="mdi:alert-outline" class="h-5 w-5" />
					<span>This concept already has changes waiting to be applied. Check your edit doesn't conflict with them.</span>
				</div>
				{#each data.pending_changes as change (change.id)}
					<PendingChange {change}>
						<ChangeDiffData {change} />
					</PendingChange>
				{/each}
			</section>
		{/if}

		{#if data.word_choices.length > 0}
			<nav aria-label="Uses of the word in the verse" class="flex flex-wrap items-center gap-2 text-sm">
				<span>This verse uses {data.concept_data.stem} {data.word_choices.length} times. Make the example from use</span>
				{#each data.word_choices as { entity, href }, i (entity)}
					<a {href} aria-current={entity === data.word_index ? 'true' : undefined} class={['btn btn-xs', entity === data.word_index ? 'btn-primary' : 'btn-outline']}>
						{i + 1}
					</a>
				{/each}
			</nav>
		{/if}

		<form onsubmit={handle_save} class="flex flex-col gap-6">
			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<h3 class="font-semibold">
						{data.reference.id_primary} {data.reference.id_secondary}:{data.reference.id_tertiary}
					</h3>
					<button type="button" onclick={() => editor.reset()} class="btn btn-sm btn-ghost">
						<Icon icon="mdi:restore" class="h-4 w-4" />
						Reset
					</button>
				</div>

				<p class="text-sm text-base-content/70">
					Click a part of the example to delete it. The word <strong>{data.concept_data.stem}</strong> and what holds it can't be deleted.
				</p>

				<div class="bg-base-100 rounded-box flex flex-wrap p-3">
					<SimplifiedEntities
						entities={editor.encoding}
						highlighted_indexes={editor.hovered_unit_indexes}
						is_clickable={index => editor.is_deletable(index)}
						onclick={index => editor.delete_unit(index)}
						onhover={index => editor.hover(index)}
					/>
				</div>
			</section>

			<fieldset class="fieldset">
				<legend class="fieldset-legend font-semibold">English equivalent</legend>
				<input type="text" bind:value={editor.sentence} class="input input-bordered w-full" />
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend font-semibold">As it will be saved</legend>
				<output class="bg-base-100 rounded-box block min-h-10 break-all p-2 font-mono text-sm">{editor.encoded_example ?? ''}</output>
			</fieldset>

			{#if editor.has_case_frame}
				<section class="flex flex-col gap-2">
					<h3 class="font-semibold">Change to the {categories_label}</h3>

					<div class="flex flex-wrap items-center gap-2">
						{#each editor.case_frame_changes as { kind, label } (`${kind} ${label}`)}
							<span class={['badge', kind === 'new' ? 'badge-success' : 'badge-warning']}>{kind} {label}</span>
						{:else}
							<span class="text-sm text-base-content/70">The example shows nothing that the {categories_label} doesn't already have.</span>
						{/each}

						{#if !editor.is_following_example}
							<button type="button" onclick={() => editor.apply_suggestion()} class="btn btn-xs btn-outline">
								Use what the example calls for
							</button>
						{/if}
					</div>

					<Category part_of_speech={data.concept_data.part_of_speech} bind:categories={editor.categories} />
				</section>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<button type="submit" disabled={!editor.curated_examples_to_save || saving} class="btn btn-primary">
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Save
				</button>
				<a href="/?q={data.concept_data.stem}" class="btn btn-ghost">Cancel</a>
				{#if editor.validation_message}
					<span role="status" class="text-sm text-warning">{editor.validation_message}</span>
				{/if}
			</div>
		</form>
	</div>
</article>
