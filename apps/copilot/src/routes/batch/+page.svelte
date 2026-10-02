<script lang="ts">
	import { persisted } from '$lib/store.svelte'
	import BookSelect from '$lib/BookSelect.svelte'
	import Settings from '$lib/Settings.svelte'
	import Icon from '@iconify/svelte'
	import { SvelteSet } from 'svelte/reactivity'
	import { convert_to_usfm } from '$lib/usfm'
	import { default_settings, lwc_info, mtt_level_info } from '$lib/lookups'
	import { fetch_batch_cautions, fetch_brief_headings, fetch_notes, fetch_verses_for_chapter } from '$lib/fetches'
	import { USFM_BOOK_CODES } from '@tabitha/types/patterns'
	import type { CopilotResult } from '@tabitha/types'
	import type { CopilotSettings, ChapterReference } from '$lib/types'
	import { m } from '$lib/paraglide/messages'
	import { MODE_LABELS } from '$lib/labels'

	let reference = $state(persisted<ChapterReference>({ key: 'saved_verse', defaultValue: {
		book: 'Genesis',
		chapter: 1,
	} }).value)
	let start_verse = $state(1)
	let end_verse = $state(0)
	let verse_count = $derived(end_verse - start_verse + 1)

	let settings = $state(persisted<CopilotSettings>({ key: 'saved_settings@1.6', defaultValue: default_settings }).value)
	
	let error_text = $state('')

	let fetching_verse_count = $state(false)
	let verses_in_chapter = $state<number | null>(0)

	let fetching_results = $state(false)
	let fetched_results = $state<CopilotResult[]>([])
	let completed_verses = $derived(fetched_results.length)

	let retry_set = $state(new SvelteSet<number>())

	let generating_sfm = $state(false)

	let doing_batch_operation = $derived(fetching_verse_count || fetching_results || generating_sfm)
	let can_do_batch_operation = $derived(!doing_batch_operation && retry_set.size === 0)

	$effect(() => {
		fetching_verse_count = true
		fetch_verses_for_chapter(reference)
			.then(result => {
				verses_in_chapter = result
				end_verse = verses_in_chapter || start_verse
			})
			.finally(() => {
				fetching_verse_count = false
			})
	})

	async function fetch_results() {
		fetching_results = true
		fetched_results = []
		error_text = ''
		try {
			await fetch_batch_cautions({
				reference,
				start_verse,
				end_verse,
				settings,
				on_progress: next_results => fetched_results.push(...next_results),
			})
		} catch (error) {
			error_text = m.generating_notes_failed({ error: error instanceof Error ? error.message : String(error) })
			console.error(error)
		} finally {
			fetching_results = false
		}
	}

	async function retry_single_result(index: number) {
		retry_set.add(index)

		const verse = fetched_results[index].verse
		try {
			const result = await fetch_notes({ reference: verse, settings })
			fetched_results[index] = result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			fetched_results[index] = { type: 'error', verse, error: message }
			console.error(message)
		} finally {
			retry_set.delete(index)
		}
	}
	
	async function download_as_sfm() {
		generating_sfm = true
		try {
			const { book, chapter } = reference
			const book_code = USFM_BOOK_CODES[book] || book

			const headings = settings.mode === 'brief' ? await fetch_brief_headings(settings.lwc) : undefined
			
			const sfm_text = [
				`\\id ${book_code}`,
				`\\c ${chapter}`,
				...fetched_results.map(result => convert_to_usfm({ result, lwc: settings.lwc, headings })),
			].join('\n')

			const blob = new Blob([sfm_text], { type: 'text/plain;charset=utf-8' })
			
			// Create link and trigger download
			const url = window.URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			const ref_string = `${book_code} ${chapter} ${start_verse}-${end_verse}`
			const setting_codes = `${lwc_info[settings.lwc].code} ${mtt_level_info[settings.mtt_level].code}`
			a.download = `${ref_string} - TaBiThA ${settings.mode} notes - ${setting_codes}.sfm` // File name
			document.body.appendChild(a)
			a.click()
			
			// Cleanup
			window.URL.revokeObjectURL(url)
			a.remove()
		} catch (error) {
			error_text = m.download_failed({ error: error instanceof Error ? error.message : String(error) })
			console.error(error)
		} finally {
			generating_sfm = false
		}
	}
</script>

<form>
	<section class="py-2 flex gap-4 items-center">
		<h3 class="text-lg font-bold">{m.chapter()}</h3>
		
		<BookSelect bind:book={reference.book} disabled={fetching_results} />
		<input type="number" bind:value={reference.chapter} disabled={fetching_results} min="1" class="input w-20" />

		{#if verses_in_chapter === null}
			<div class="prose mt-1">
				{m.invalid_chapter()}
			</div>
		{:else if verses_in_chapter > 0}
			<div class="divider divider-horizontal"></div>
			<div class="flex gap-4">
				<h3 class="text-lg font-bold">{m.verses()}</h3>
				<input type="number" bind:value={start_verse} disabled={fetching_results} min="1" class="input w-20" />
				<div class="mt-1">{m.verse_range_to()}</div>
				<input type="number" bind:value={end_verse} disabled={fetching_results} min="1" max={verses_in_chapter} class="input w-20" />
				<div class="mt-1">{m.verses_in_chapter({ count: verses_in_chapter })}</div>
			</div>
		{/if}
	</section>

	<div class="flex gap-3 items-center">
		<Settings bind:settings={settings} />

		<button type="button" onclick={fetch_results} disabled={!can_do_batch_operation} class="btn btn-primary btn-md my-4">
			<Icon icon="mdi:lightbulb-outline" class="h-5 w-5" />
			{m.get_notes({ mode: MODE_LABELS[settings.mode]() })}
		</button>

		{#if fetched_results.length > 0}
			<button type="button" onclick={download_as_sfm} disabled={!can_do_batch_operation} class="btn btn-secondary btn-md my-4">
				<Icon icon="mdi:download" class="h-5 w-5" />
				{m.download_usfm()}
				{#if generating_sfm}
					<Icon icon="line-md:loading-twotone-loop" class="h-8 w-8" />
				{/if}
			</button>
		{/if}
	</div>
</form>

{#if error_text.length}
	<div class="text-error">{error_text}</div>
{/if}

<div class="flex items-center gap-1">
	{#if fetching_results}
		<Icon icon="line-md:loading-twotone-loop" class="h-5 w-5" />
		{#if settings.mode === 'brief'}
			{m.loading_brief_progress({ completed: completed_verses, total: verse_count })}
		{:else}
			{m.loading_notes_progress({ completed: completed_verses, total: verse_count })}
		{/if}
	{:else if completed_verses > 0}
		<Icon icon="mdi:check" class="h-6 w-6 text-success" />
		{m.loaded_verses({ count: verse_count })}
	{/if}
</div>
{#if fetching_results || completed_verses > 0}
	<progress value={completed_verses} max={verse_count} class="progress progress-primary w-100"></progress>
{/if}

{#if fetched_results.length > 0}
	<table class="table">
		<thead>
			<tr>
				<th>{m.verse()}</th>
				<th>{m.status()}</th>
				<th>{m.details()}</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each fetched_results as result, i}
				<tr>
					<td>{result.verse.book} {result.verse.chapter}:{result.verse.verse}</td>
					{#if result.type === 'error'}
						{@const retrying = retry_set.has(i)}
						<td><span class="badge badge-error">{m.status_error()}</span></td>
						<td>{result.error}</td>
						<td>
							<button
								type="button"
								onclick={() => retry_single_result(i)}
								disabled={doing_batch_operation || retrying}
								class="btn btn-sm my-4"
							>
								{#if retrying}
									<Icon icon="line-md:loading-twotone-loop" class="h-6 w-6" />
								{:else}
									{m.retry()}
								{/if}
							</button>
						</td>
					{:else if result.type === 'discern'}
						<td><span class="badge badge-success">{m.status_ready()}</span></td>
						<td colspan="2">{m.discern_summary({ count: result.notes.length })}</td>
					{:else if result.type === 'brief'}
						{@const other_notes_length = result.cultural_background.length + result.image_keywords.length + result.consultant_decisions.length}
						<td><span class="badge badge-success">{m.status_ready()}</span></td>
						<td colspan="2">
							{m.brief_summary({ semantic: result.semantic_notes.length, tnn: result.tnn_notes.length, other: other_notes_length })}
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
