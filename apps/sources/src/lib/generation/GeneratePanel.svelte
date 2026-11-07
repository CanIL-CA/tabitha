<script lang="ts">
	import { browser_engine } from '#lib/generation/browser_engine.svelte.js'
	import type { VerseGeneration } from '#lib/generation/verse_generation.js'
	import Icon from '@iconify/svelte'

	let { generate_url, generation }: { generate_url: string, generation: VerseGeneration } = $props()

	const AUDIENCES = [1, 2, 3, 4]
	const RUN_ON_LABELS = { server: 'Server', browser: 'This browser' } as const

	type RunOn = keyof typeof RUN_ON_LABELS
	type GenerationResult = { text?: string, error?: string }

	let audience = $state(1)
	let run_on = $state<RunOn>('server')
	let generating = $state(false)
	let text = $state('')
	let error_message = $state('')
	let result_caption = $state('')

	let waiting_for_engine = $derived(run_on === 'browser' && browser_engine.status !== 'ready')

	function choose_run_on() {
		if (run_on === 'browser') browser_engine.load()
	}

	async function generate_on_server(): Promise<GenerationResult> {
		try {
			const response = await fetch(generate_url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ audience }),
			})
			const result = await response.json().catch(() => ({})) as { text?: string, error?: string, message?: string }
			if (response.ok && result.text) return { text: result.text }
			return { error: result.error ?? result.message ?? `Generation failed (${response.status}).` }
		}
		catch {
			return { error: 'Generation failed. Check your connection and try again.' }
		}
	}

	async function generate_in_browser(): Promise<GenerationResult> {
		if ('error' in generation) return { error: generation.error }
		return await browser_engine.generate({ job: generation.job, audience })
	}

	async function generate() {
		generating = true
		text = ''
		error_message = ''
		const started = performance.now()
		const result = run_on === 'server' ? await generate_on_server() : await generate_in_browser()
		text = result.text ?? ''
		error_message = result.text ? '' : result.error ?? 'The engine produced no text.'
		result_caption = `${RUN_ON_LABELS[run_on]} · ${Math.round(performance.now() - started)} ms`
		generating = false
	}
</script>

<div class="card card-border bg-base-200 mb-4">
	<div class="card-body gap-3">
		<div class="flex flex-wrap items-center gap-3">
			<h2 class="card-title text-base">Generate English text</h2>
			<span class="badge badge-warning badge-sm">Experimental</span>
			<div class="ms-auto flex flex-wrap items-center gap-2">
				<label class="select select-sm w-auto">
					<span class="label">Run on</span>
					<select bind:value={run_on} onchange={choose_run_on} disabled={generating}>
						{#each Object.entries(RUN_ON_LABELS) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="select select-sm w-auto">
					<span class="label">Audience</span>
					<select bind:value={audience} disabled={generating}>
						{#each AUDIENCES as audience_option (audience_option)}
							<option value={audience_option}>{audience_option}</option>
						{/each}
					</select>
				</label>
				<button onclick={generate} disabled={generating || waiting_for_engine} class="btn btn-primary btn-sm">
					{#if generating}
						<span class="loading loading-spinner loading-xs"></span>
						Generating…
					{:else}
						<Icon icon="mdi:text-box-outline" class="h-4 w-4" />
						Generate
					{/if}
				</button>
			</div>
		</div>

		{#if run_on === 'browser'}
			<p class="text-sm opacity-70">
				{#if browser_engine.status === 'loading'}
					<span class="loading loading-spinner loading-xs"></span>
					Downloading the engine (about 2.7 MB) and starting it in this browser…
				{:else if browser_engine.status === 'ready'}
					<Icon icon="mdi:check-circle-outline" class="inline h-4 w-4" />
					Engine running in this browser (started in {(browser_engine.load_ms / 1000).toFixed(1)} s). Generating needs no network now, so you can go offline and keep generating on this page.
				{:else if browser_engine.status === 'failed'}
					<Icon icon="mdi:alert-circle-outline" class="inline h-4 w-4" />
					The engine could not start: {browser_engine.load_error}
				{/if}
			</p>
		{/if}

		{#if text}
			<p class="text-lg">{text}</p>
			<p class="text-xs opacity-60">{result_caption}</p>
		{:else if error_message}
			<div role="alert" class="alert alert-error alert-soft">
				<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
				<span>{error_message}</span>
			</div>
		{:else}
			<p class="text-sm opacity-70">Generates this verse's English text from its encoding with TBTA's engine, either on the server or in this browser. On the server, the first request after a quiet spell can take several seconds.</p>
		{/if}
	</div>
</div>
