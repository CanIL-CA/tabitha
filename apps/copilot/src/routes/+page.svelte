<script lang="ts">
	import { default_settings } from '$lib/lookups'
	import { fetch_notes, fetch_target_text } from '$lib/fetches'
	import { persisted } from '$lib/store.svelte'
	import Icon from '@iconify/svelte'
	import BookSelect from '$lib/BookSelect.svelte'
	import Settings from '$lib/Settings.svelte'
	import CopilotResultDisplay from '$lib/CopilotResultDisplay.svelte'
	import type { TargetTextData, CopilotResult, VerseReference } from '@tabitha/types'
	import type { CopilotSettings, CopilotStep } from '$lib/types'
	import { m } from '$lib/paraglide/messages'
	import { MODE_LABELS } from '$lib/labels'

	let reference = $state(persisted<VerseReference>({ key: 'saved_verse', defaultValue: {
		book: 'Genesis',
		chapter: 1,
		verse: 1,
	} }).value)
	let submitted_reference = $state<VerseReference>($state.snapshot(reference))

	let settings = $state(persisted<CopilotSettings>({ key: 'saved_settings@1.7', defaultValue: default_settings }).value)

	let fetching_english = $state(false)
	let english_text = $state<TargetTextData | null>(null)

	let fetching_notes = $state(false)
	let steps_reached = $state<CopilotStep[]>([])
	const expected_step_count = $derived(settings.mode === 'discern' ? 1 : settings.lwc === 'English' ? 3 : 4)
	let result = $state<CopilotResult | null>(null)

	const STEP_LABELS: Record<CopilotStep, () => string> = {
		notes: m.step_notes,
		aquifer: m.step_aquifer,
		brief: m.step_brief,
		translate: m.step_translate,
	}

	async function get_english_text() {
		fetching_english = true
		english_text = await fetch_target_text({ reference, project: 'English', preferred_audience: 'Unchurched Adults' })
		fetching_english = false
	}

	async function get_notes() {
		fetching_notes = true
		steps_reached = []

		const { book, chapter, verse } = reference
		submitted_reference = { book, chapter, verse }

		try {
			result = await fetch_notes({ reference, settings, on_step: step => steps_reached.push(step) })
		} catch (err) {
			const message = err instanceof Error ? err.message : m.unexpected_error()
			console.error(message)
			result = {
				type: 'error',
				verse: submitted_reference,
				error: message,
			}
		}

		fetching_notes = false
	}
</script>

<form>
	<section class="py-2 flex gap-4 items-center">
		<h3 class="text-lg font-bold">{m.verse()}</h3>
		<BookSelect bind:book={reference.book} />
		<input type="number" bind:value={reference.chapter} min="1" class="input w-20" />
		<input type="number" bind:value={reference.verse} min="1" class="input w-20" />
		<button type="button" onclick={get_english_text} class="btn btn-md">
			{m.preview_english()}
		</button>
	</section>

	{#if fetching_english}
		<div class="prose mb-3">
			<h4>{m.english_preview()}</h4>
			<div>{m.loading()}</div>
		</div>
	{:else if english_text}
		<div class="w-full mb-3">
			<div class="prose"><h4>{m.english_preview()}</h4></div>
			<div>({english_text?.audience}) {english_text?.text || ''}</div>
		</div>
	{/if}
	
	<div class="flex gap-3 items-center">
		<Settings bind:settings={settings} />

		<button type="button" onclick={get_notes} disabled={fetching_notes} class="btn btn-primary btn-md my-4">
			<Icon icon="mdi:lightbulb-outline" class="h-5 w-5" />
			{m.get_notes({ mode: MODE_LABELS[settings.mode]() })}
		</button>
	</div>
</form>

<div class="prose">
	<h2>{m.notes_for({ reference: `${reference.book} ${reference.chapter}:${reference.verse}` })}</h2>
</div>

{#if fetching_notes}
	<ul>
		{#each steps_reached as step, i (step)}
			<li class="flex items-center gap-1">
				{#if i === steps_reached.length - 1}
					<Icon icon="line-md:loading-twotone-loop" class="h-5 w-5" />
				{:else}
					<Icon icon="mdi:check" class="h-5 w-5 text-success" />
				{/if}
				{STEP_LABELS[step]()}
			</li>
		{:else}
			<li class="flex items-center gap-1">
				<Icon icon="line-md:loading-twotone-loop" class="h-5 w-5" />
				{m.loading()}
			</li>
		{/each}
	</ul>
	<progress value={Math.max(0, steps_reached.length - 1)} max={expected_step_count} class="progress progress-primary w-100"></progress>
{:else if result}
	<CopilotResultDisplay {result} {settings} />
{/if}
