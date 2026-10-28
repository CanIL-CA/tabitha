<script lang="ts">
	import Icon from '@iconify/svelte'
	import { goto } from '$app/navigation'
	import type { PageProps } from './$types'
	import { Category } from '#lib/card/categorization/edit/index.js'
	import { default_categories, levels, parts_of_speech } from '#lib/lookups.js'
	import { level_gloss_labels, apply_gloss_label, relabel_gloss_for_level } from '#lib/concept_form/gloss_labels.js'
	import { create_fallback_concept } from '#lib/transformers.js'
	import { EMPTY_STEM_SENSES, look_up_stem_senses } from '#lib/concept_form/stem_senses.js'
	import Header from '#lib/card/Header.svelte'
	import { Toast } from '@tabitha/ui'
	import { enqueue } from '#lib/offline/sync.js'
	import type { SaveResult, StemSensesResult } from '#lib/types.js'
	import type { PartOfSpeech } from '@tabitha/types'

	const SENSE_LOOKUP_DELAY_MS = 500

	let { data }: PageProps = $props()

	// svelte-ignore state_referenced_locally
	let concept_data = $state(data.concept_data)
	let can_save = $derived(concept_data.stem && concept_data.sense && concept_data.part_of_speech)

	let gloss_labels = $derived(level_gloss_labels[concept_data.level] ?? [])

	let fetching_sense = $state(false)
	let sense_lookup_timer: ReturnType<typeof setTimeout> | undefined
	let stem_senses = $state<StemSensesResult>(EMPTY_STEM_SENSES)

	let saving = $state(false)
	let error_message = $state('')

	function dismiss_toast() {
		error_message = ''
	}

	function autofocus(node: HTMLInputElement) {
		node.focus()
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

	function set_stem(stem: string) {
		concept_data.stem = stem
		look_up_senses()
	}

	function set_part_of_speech(part_of_speech: PartOfSpeech) {
		concept_data.part_of_speech = part_of_speech
		concept_data.categories = default_categories[part_of_speech]?.slice() ?? []
		look_up_senses()
	}

	function set_level(level: string) {
		concept_data.level = level
		concept_data.gloss = relabel_gloss_for_level({ gloss: concept_data.gloss, level })
	}

	function set_gloss_label(label: string) {
		concept_data.gloss = apply_gloss_label({ gloss: concept_data.gloss, label })
	}

	// the timer prevents a fetch request from being sent on every keystroke
	function look_up_senses() {
		clearTimeout(sense_lookup_timer)

		const { stem, part_of_speech } = concept_data
		fetching_sense = Boolean(stem && part_of_speech)
		if (!fetching_sense) {
			stem_senses = EMPTY_STEM_SENSES
			return
		}

		sense_lookup_timer = setTimeout(async () => {
			try {
				const found_senses = await look_up_stem_senses({ stem, part_of_speech })
				// a slow response for a stem that has since been edited would otherwise overwrite the newer one
				if (stem !== concept_data.stem || part_of_speech !== concept_data.part_of_speech) return

				stem_senses = found_senses
				concept_data.sense = found_senses.next_sense
			} catch (err) {
				console.error({ err })
			} finally {
				fetching_sense = false
			}
		}, SENSE_LOOKUP_DELAY_MS)
	}
</script>

{#if error_message}
	<Toast variant="error" on_dismiss={dismiss_toast}>{error_message}</Toast>
{/if}

<article class="card bg-base-200 mx-auto w-[80%]">
	<div class="card-body">
		<div class="prose pb-4">
			<h2>Add a new concept</h2>
		</div>

		<form onsubmit={handle_submit} class="flex flex-col gap-6">
			<section class="flex flex-wrap gap-4 items-end">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Stem</legend>
					<input
						name="stem"
						bind:value={() => concept_data.stem, set_stem}
						use:autofocus
						autocomplete="off"
						class="input input-bordered" required />
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Part of speech</legend>
					<select name="part_of_speech" bind:value={() => concept_data.part_of_speech, set_part_of_speech} class="select select-bordered" required>
						{#each parts_of_speech as pos}
							<option value={pos}>{pos}</option>
						{/each}
					</select>
				</fieldset>

				<input name="sense" type="hidden" bind:value={concept_data.sense} />

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Level</legend>
					<select name="level" bind:value={() => concept_data.level, set_level} class="select select-bordered w-24">
						{#each levels.keys().filter(k => k !== '0') as level}
							<option value={level}>{level}</option>
						{/each}
					</select>
				</fieldset>
			</section>

			{#if fetching_sense}
				<Icon icon="line-md:loading-twotone-loop" class="h-6 w-6 text-warning" />

			{:else if concept_data.sense}
				{@const concept_for_header = create_fallback_concept(concept_data)}

				<section class="flex flex-col gap-2">
					<section class="card-title justify-between ml-2">
						<Header concept={concept_for_header} />
					</section>

					{#if stem_senses.has_pending_create}
						<div role="alert" class="alert alert-warning alert-soft">
							<Icon icon="mdi:alert-outline" class="h-5 w-5" />
							<span>A {concept_data.part_of_speech} "{concept_data.stem}" is already waiting to be added. Check it doesn't have the same meaning before adding another.</span>
						</div>
					{/if}

					{#if stem_senses.senses.length > 0}
						<details open class="collapse collapse-arrow bg-base-100">
							<summary class="collapse-title min-h-0 py-2 text-xs font-semibold">Existing Senses</summary>
							<ul class="collapse-content list pb-2 text-xs">
								{#each stem_senses.senses as { sense, gloss, status }}
									<li class="list-row items-center p-2">
										<span class="font-semibold">{stem_senses.stem}-{sense}</span>
										<span class="list-col-grow">{gloss}</span>
										{#if status !== 'in ontology'}
											<span class="badge badge-warning badge-sm">{status}</span>
										{/if}
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</section>
			{/if}

			<section class="flex flex-col gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Gloss</legend>
					{#if gloss_labels.length > 0}
						<div class="flex flex-wrap items-center gap-2">
							<span class="label text-xs text-accent">Pick a label appropriate for a level {concept_data.level} concept:</span>
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
					<textarea
						name="gloss"
						bind:value={concept_data.gloss}
						placeholder="{gloss_labels.join('/')} ..."
						class="textarea textarea-bordered field-sizing-content w-full" rows="2"></textarea>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Brief gloss</legend>
					<input name="brief_gloss" bind:value={concept_data.brief_gloss} class="input input-bordered w-full max-w-md" />
					<p class="label text-xs text-accent">optional - a one or two word description for stems with lots of senses</p>
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
