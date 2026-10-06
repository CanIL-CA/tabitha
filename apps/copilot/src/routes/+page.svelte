<script lang="ts">
	import { default_settings, get_no_notes_text, get_no_tnn_text } from '$lib/lookups'
	import { fetch_notes, fetch_target_text } from '$lib/fetches'
	import { persisted } from '$lib/store.svelte'
	import Icon from '@iconify/svelte'
	import BookSelect from '$lib/BookSelect.svelte'
	import Settings from '$lib/Settings.svelte'
	import type { TargetTextData, CopilotResult, CopilotNote, VerseReference } from '@tabitha/types'
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

{#snippet empty_section(text: string)}
	<p class="text-base-content/70">{text}</p>
{/snippet}

{#snippet semantic_notes(notes: CopilotNote[])}
	{#if notes.length === 0}
		{@render empty_section(get_no_notes_text(settings.lwc))}
	{:else}
		<ul class="list list-disc text-base ms-5">
			{#each notes as note}
				<li>
					{#if note.quoted_text}
						"...{note.quoted_text}..." -
					{/if}
					{note.meaning} {note.check}
					{#if settings.show_note_sources}
						<ul class="list ms-5">
							<li>- {JSON.stringify(note.trigger.flags)}</li>
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet notes_title(reference: VerseReference)}
	<div class="prose"><h2>{m.notes_for({ reference: `${reference.book} ${reference.chapter}:${reference.verse}` })}</h2></div>
{/snippet}

{#if fetching_notes}
	{@render notes_title(submitted_reference)}
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

{:else if result?.type === 'error'}
	{@render notes_title(result.verse)}
	<div class="text-error">{result.error}</div>

{:else if result?.type === 'discern'}
	<div class="w-full pb-8">
		{@render notes_title(result.verse)}

		{#if settings.lwc === 'English' || settings.show_english}
			<div class="mt-3">
				<div class="prose"><h4>{m.english_text()}</h4></div>
				<p>{result.english_text}</p>
			</div>
		{/if}

		{#if result.lwc_text && settings.lwc !== 'English'}
			<div class="mt-3">
				<div class="prose"><h4>{m.lwc_text({ lwc: settings.lwc })}</h4></div>
				<p>{result.lwc_text}</p>
			</div>
		{/if}

		<div class="mt-3">
			<div class="prose"><h4>{m.notes_cautions()}</h4></div>
			{@render semantic_notes(result.notes)}
		</div>
	</div>
{:else if result?.type === 'brief'}
	<div class="w-full pb-8">
		{@render notes_title(result.verse)}

		<div class="mt-3">
			<div class="prose"><h4>{m.lwc_named_text({ lwc: settings.lwc })}</h4></div>
			<p>{result.lwc_text}</p>
		</div>

		<div class="mt-3">
			<div class="prose"><h4>{m.semantic_notes()}</h4></div>
			{@render semantic_notes(result.semantic_notes)}
		</div>

		<div class="mt-3">
			<div class="prose"><h4>{m.tnn_notes()}</h4></div>
			{#if result.tnn_notes.length === 0}
				{@render empty_section(get_no_tnn_text({ lwc: settings.lwc, tnn_available: result.tnn_available }))}
			{:else}
				<ul class="list list-disc text-base ms-5">
					{#each result.tnn_notes as note}
						<li>{note}</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if result.cultural_background.length > 0}
			<div class="mt-3">
				<div class="prose"><h4>{m.cultural_background()}</h4></div>
				<ul class="list list-disc text-base ms-5">
					{#each result.cultural_background as { term, summary }}
						<li>{term} - {summary}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.image_keywords.length > 0}
			<div class="mt-3">
				<div class="prose"><h4>{m.image_keywords()}</h4></div>
				<ul class="list list-disc text-base ms-5">
					{#each result.image_keywords as kw}
						<li>{kw}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.consultant_decisions.length > 0}
			<div class="mt-3">
				<div class="prose"><h4>{m.consultant_decisions()}</h4></div>
				<ul class="list list-disc text-base ms-5">
					{#each result.consultant_decisions as { status, text }}
						<li>{status} - {text}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}
