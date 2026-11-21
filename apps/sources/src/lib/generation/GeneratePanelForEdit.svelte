<script lang="ts">
	import { browser_engine } from '#lib/generation/browser_engine.svelte.js'
	import Icon from '@iconify/svelte'
	import { onMount } from 'svelte'
	import { AUDIENCES } from '@tabitha/generator/engine'
	import type { GenerateSettings } from '#lib/types.ts'
	import type { GenerationJob } from './verse_generation'
	import type { Reference } from '@tabitha/types'
	import type { Validation } from '#lib/edit/validation.svelte.js'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { book_order_index } from '@tabitha/types/patterns'
	import { encode_source_entities } from '#lib/encoding/semantic_encoding.ts'

	let { reference, validation }: { reference: Reference, validation: Validation } = $props()
	
	let generate_settings: GenerateSettings = $state({ audiences: [2] })

	const edit_history = get_edit_history()

	let job = $derived<GenerationJob>({
		book: book_order_index({ reference }) + 1,
		chapter: Number(reference.id_secondary),
		verse: Number(reference.id_tertiary),
		encoding: encode_source_entities(edit_history().current.source_entities),
		previous_encoding: '',
	})

	let waiting_for_engine = $derived(browser_engine.status !== 'ready')
	let generating = $state(false)
	let error_message = $state('')

	type GenerationResultDisplay = { text: string, error: string, audience: number }
	let results = $state<GenerationResultDisplay[]>([])

	onMount(() => {
		// start loading the engine immediately so it's ready before the user needs it
		browser_engine.load()

		const setting_json = localStorage.getItem('source_generate_settings')
		if (setting_json) {
			generate_settings = JSON.parse(setting_json)
		}
	})

	function toggle_audience(number: number) {
		if (generate_settings.audiences.includes(number)) {
			generate_settings.audiences = generate_settings.audiences.filter(item => item !== number)
		} else {
			generate_settings.audiences = [...generate_settings.audiences, number].toSorted()
		}
		store_settings()
	}

	function store_settings() {
		const setting_json = JSON.stringify(generate_settings)
		localStorage.setItem('source_generate_settings', setting_json)
	}

	async function generate() {
		if (generating || waiting_for_engine) {
			return
		}

		results = []

		if (edit_history().current.source_entities.length === 0) {
			error_message = 'There is no encoding to generate.'
		}

		validation.show()
		if (validation.errors.length) {
			error_message = 'Must fix the encoding errors before generating.'
		} else if (validation.warnings.length === 0) {
			validation.hide()
		}

		if (generate_settings.audiences.length === 0) {
			error_message = 'Must select at least one audience to generate.'
		}

		generating = true
		const started = performance.now()
		for (const audience of generate_settings.audiences) {
			const result = await browser_engine.generate({ job, audience })
			results.push({
				audience,
				text: result.text ?? '',
				error: result.text ? '' : result.error ?? 'The engine produced no text.',
			})
		}
		console.info(`generation ran in ${Math.round(performance.now() - started)} ms`)
		generating = false
	}

	function handle_keyboard_shortcut(event: KeyboardEvent) {
		if (!event.ctrlKey && !event.metaKey) return
		if (event.shiftKey) return

		if (event.key.toLowerCase() === 'g') {
			event.preventDefault()
			generate()
		}
	}
</script>

<svelte:window onkeydown={handle_keyboard_shortcut} />

<div class="card card-dash relative mb-4 border-warning bg-warning/10">
	<div class="pointer-events-none absolute inset-0 overflow-hidden rounded-box" aria-hidden="true">
		<Icon icon="mdi:flask-outline" class="absolute -right-6 -bottom-8 h-40 w-40 text-warning opacity-15" />
	</div>
	<div class="card-body relative gap-3">
		<div class="flex flex-wrap items-center gap-3">
			<Icon icon="mdi:flask-outline" class="h-7 w-7 text-warning" aria-hidden="true" />
			<h2 class="card-title text-base">Generated English text</h2>
			<span class="badge badge-warning">
				<Icon icon="mdi:test-tube" class="h-4 w-4" aria-hidden="true" />
				Experimental
			</span>
			<div class="ms-auto flex flex-wrap items-center gap-2">
				<div class="join">
					<button
						onclick={generate}
						title="Generate (Ctrl+G)"
						disabled={generating || waiting_for_engine}
						class="btn btn-primary btn-sm join-item"
					>
						{#if generating}
							<span class="loading loading-spinner loading-xs"></span>
							Generating…
						{:else}
							<Icon icon="mdi:text-box-outline" class="h-4 w-4" />
							Generate
						{/if}
					</button>
					
					<details class="dropdown dropdown-end">
						<summary class="btn btn-primary btn-sm px-2 join-item">&#709;</summary>
						<div class="menu dropdown-content bg-base-100 rounded-box p-2 shadow-sm">
							<ul class="overflow-y-auto">
								{#each AUDIENCES as { number, name } (number)}
									<li>
										<label class="label justify-start gap-2">
											<input
												type="checkbox"
												class="checkbox checkbox-sm checkbox-primary"
												checked={generate_settings.audiences.includes(number)}
												onchange={() => toggle_audience(number)}
											/>
											<span class="label-text">{number} · {name}</span>
										</label>
									</li>
								{/each}
							</ul>
						</div>
					</details>
				</div>
			</div>
		</div>
		
		<p class="text-sm opacity-70">
			{#if browser_engine.status === 'loading'}
				<span class="loading loading-spinner loading-xs"></span>
				Downloading the engine (about 2.7 MB) and starting it in this browser…
			{:else if browser_engine.status === 'failed'}
				<Icon icon="mdi:alert-circle-outline" class="inline h-4 w-4" />
				The engine could not start: {browser_engine.load_error}
			{/if}
		</p>

		{#if error_message}
			<div role="alert" class="alert alert-error alert-soft">
				<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
				<span>{error_message}</span>
			</div>
		{/if}

		{#each results as { audience, text, error }}
			{@const audience_name = AUDIENCES.find(({ number }) => number === audience)?.name ?? audience.toString()}
			<span class="opacity-60 italic font-semibold">{audience_name}</span>
			{#if text}
				<p class="text-base">{text}</p>
			{:else if error}
				<div role="alert" class="alert alert-error alert-soft">
					<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
					<span>{error}</span>
				</div>
			{/if}
		{:else}
			<p class="text-sm opacity-70">Generates the English text from this verse's encoding.</p>
		{/each}
	</div>
</div>
