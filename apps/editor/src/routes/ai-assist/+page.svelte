<script lang="ts">
	import { goto } from '$app/navigation'
	import { network_state } from '@tabitha/ui'
	import BackTranslation from '#lib/BackTranslation.svelte'
	import CopyButton from '#lib/CopyButton.svelte'
	import { save_state } from '#lib/save/index.js'
	import { Tokens } from '#lib/tokens/index.js'
	import { create_editor_client } from '@tabitha/api-client'
	import Icon from '@iconify/svelte'
	import type { AiAssistResult } from '@tabitha/types'

	let entered_text = $state('')
	let generating = $state(false)
	let result = $state<AiAssistResult | null>(null)

	const editor_client = create_editor_client({ base_url: '/' })

	async function generate() {
		generating = true
		result = await editor_client.ai_assist_generate(sanitize_input(entered_text))
		generating = false
	}

	function sanitize_input(text: string): string {
		return text.replaceAll('\n', ' ')
	}

	function clear() {
		entered_text = ''
		result = null
	}

	function send_to_editor() {
		if (!result) return

		save_state.set(result.phase_1)
		goto('/')
	}
</script>

<form class="grid justify-items-center">
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		bind:value={entered_text}
		rows="5"
		autofocus
		placeholder="Enter English text to encode, e.g. a Bible verse"
		class="textarea textarea-bordered textarea-lg w-4/5"></textarea>

	<div class="w-4/5 mt-8 grid grid-cols-3">
		<div class="flex flex-row flex-wrap col-span-2">
			<button onclick={clear} type="button" class="btn btn-secondary">
				Clear

				<Icon icon="mdi:clear-bold" class="h-6 w-6" />
			</button>
		</div>

		<div class="justify-self-end">
			<button
				onclick={generate}
				type="submit"
				disabled={generating ||
					!entered_text.trim() ||
					network_state.is_offline}
				class="btn btn-primary">
				Generate

				<Icon icon="mdi:robot" class="h-6 w-6" />
			</button>
		</div>
	</div>
</form>

{#if generating}
	<div class="divider my-12 divider-warning">
		<Icon
			icon="line-md:loading-twotone-loop"
			class="h-16 w-16 text-warning" />
	</div>
{:else if result}
	{#if result.status === 'error'}
		<div class="divider divider-error my-12">
			<Icon icon="mdi:close-circle" class="h-16 w-16 text-error" />
		</div>

		<p class="prose text-center mx-auto">{result.message}</p>
	{:else}
		{#if result.check.status === 'ok'}
			<div class="divider divider-success my-12">
				<Icon icon="mdi:check-circle" class="h-16 w-16 text-success" />
			</div>
		{:else if result.check.status === 'error'}
			<div class="divider divider-error my-12">
				<Icon icon="mdi:close-circle" class="h-16 w-16 text-error" />
			</div>
		{:else}
			<div class="divider divider-warning my-12">
				<Icon icon="mdi:alert-circle" class="h-16 w-16 text-warning" />
			</div>
		{/if}

		<div class="prose mx-auto max-w-none text-center">
			<h2>AI-generated Phase 1</h2>
		</div>

		<form class="grid justify-items-center">
			<textarea
				bind:value={result.phase_1}
				rows="5"
				class="textarea textarea-bordered textarea-lg w-4/5"></textarea>

			<div class="w-4/5 mt-8 flex flex-row flex-wrap justify-center gap-4">
				<CopyButton content={result.phase_1}>Copy Phase 1</CopyButton>

				<button
					onclick={send_to_editor}
					type="button"
					class="btn btn-primary">
					Send to editor

					<Icon icon="mdi:arrow-right-circle" class="h-6 w-6" />
				</button>
			</div>
		</form>

		{#if result.notes.length > 0}
			<div class="prose mx-auto mt-12 max-w-none">
				<ul>
					{#each result.notes as note}
						<li>{note}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<section
			class="flex flex-wrap items-center justify-center gap-x-4 gap-y-8 mt-12">
			<Tokens tokens={result.check.tokens} />
		</section>

		<BackTranslation back_translation={result.check.back_translation} />
	{/if}
{/if}

<style lang="postcss">
	@reference '#lib/app.css';

	/* had to override daisyui's sizing so I could make the line bigger */
	.divider::before,
	.divider::after {
		@apply h-2;
	}
</style>
