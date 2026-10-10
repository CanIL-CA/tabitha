<script lang="ts">
	import type { EditorCheckResult } from '@tabitha/types'
	import BackTranslation from '#lib/BackTranslation.svelte'
	import CopyButton from '#lib/CopyButton.svelte'
	import { SaveButton, save_state } from '#lib/save/index.js'
	import { Tokens } from '#lib/tokens/index.js'
	import { check_text, remove_auto_fix } from '#lib/check.js'
	import { set_remove_auto_fix } from '#lib/tokens/auto_fix_context.js'
	import Icon from '@iconify/svelte'

	let entered_text = $state(save_state.value)
	let checking = $state(false)
	let check_response = $state<EditorCheckResult>({
		status: 'ok',
		tokens: [],
		back_translation: '',
	})

	async function show_checked(pending_check: Promise<{ text: string; result: EditorCheckResult }>) {
		checking = true
		const { text, result } = await pending_check
		entered_text = text
		check_response = result
		checking = false
	}

	set_remove_auto_fix(auto_fix => show_checked(remove_auto_fix({ text: entered_text, auto_fix })))

	function clear() {
		entered_text = ''
		check_response = { status: 'ok', tokens: [], back_translation: '' }
	}
</script>

<form class="grid justify-items-center">
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		bind:value={entered_text}
		rows="5"
		autofocus
		class="textarea textarea-bordered textarea-lg w-4/5"></textarea>

	<div class="w-4/5 mt-8 grid grid-cols-3">
		<div class="flex flex-row flex-wrap col-span-2">
			<button onclick={clear} class="btn btn-secondary">
				Clear

				<Icon icon="mdi:clear-bold" class="h-6 w-6" />
			</button>

			<CopyButton content={entered_text} classes="ms-4">
				Copy Phase 1
			</CopyButton>

			<SaveButton content={entered_text} classes="ms-4" />
		</div>

		<div class="justify-self-end">
			<button
				onclick={() => show_checked(check_text(entered_text))}
				type="submit"
				disabled={checking}
				class="btn btn-primary">
				Check

				<Icon icon="mdi:format-list-checks" class="h-6 w-6" />
			</button>
		</div>
	</div>
</form>

{#if checking}
	<div class="divider my-12 divider-warning">
		<Icon
			icon="line-md:loading-twotone-loop"
			class="h-16 w-16 text-warning" />
	</div>
{:else}
	{@const { status, tokens, back_translation } = check_response}

	{#if tokens.length === 0}
		<div class="divider my-12"></div>
	{:else if status === 'ok'}
		<div class="divider divider-success my-12">
			<Icon icon="mdi:check-circle" class="h-16 w-16 text-success" />
		</div>
	{:else if status === 'error'}
		<div class="divider divider-error my-12">
			<Icon icon="mdi:close-circle" class="h-16 w-16 text-error" />
		</div>
	{:else if status === 'warning'}
		<div class="divider divider-warning my-12">
			<Icon icon="mdi:alert-circle" class="h-16 w-16 text-warning" />
		</div>
	{/if}

	<section class="flex flex-wrap items-center justify-center gap-x-4 gap-y-8">
		<Tokens {tokens} />
	</section>

	<BackTranslation {back_translation} />
{/if}

<style lang="postcss">
	@reference '#lib/app.css';

	/* had to override daisyui's sizing so I could make the line bigger */
	.divider::before,
	.divider::after {
		@apply h-2;
	}
</style>
