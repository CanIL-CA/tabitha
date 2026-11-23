<script lang="ts">
	import Icon from '@iconify/svelte'
	import { get_pairing_separator } from '#lib/encoding/semantic_encoding.ts'
	import type { Phase1 } from './phase1.svelte'
	import type { CheckerToken } from '@tabitha/types'

	let { phase1 }: { phase1: Phase1 } = $props()

	function get_token_text(token: CheckerToken) {
		if (token.type === 'Gap') return ''

		let parts = [token.token]
		if (token.pairing) {
			const separator = get_pairing_separator({ pairing_type: token.pairing_type, style: 'phase1' })
			parts = [...parts, separator, token.pairing.token]
		}
		if (token.pronoun) {
			parts = [token.pronoun.token, '(', ...parts, ')']
		}
		return parts.join('') + ' '
	}
</script>

<div class="card card-border border-base-300 bg-base-200">
	<div class="card-body gap-2">
		<h2 class="card-title text-base">
			{#if phase1.allow_analyze}
				Input Text (Phase 1 encoding)
			{:else}
				Phase 1 encoding (may be out of date)
			{/if}
		</h2>
	
		<textarea
			bind:value={phase1.text}
			class="textarea textarea-bordered textarea-lg text-base field-sizing-content w-full"></textarea>

		{#if phase1.analyze_result && phase1.token_messages.length}
			<div>
				{#each phase1.analyze_result.tokens as token, i}
					{@const msg = phase1.token_messages.find(({ token_index }) => i === token_index)?.message}
					{@const text = get_token_text(token)}
					{#if !msg}
						<span>{text}</span>
					{:else if msg.label === 'error'}
						<span class="text-error font-semibold">{text}</span>
					{:else}
						<span class="text-warning font-semibold">{text}</span>
					{/if}
				{/each}
			</div>

			<div>
				{#each phase1.token_messages as token_message (token_message)}
					{@const { message, token_index } = token_message}
					{@const is_error = message.label === 'error'}
					{@const token = get_token_text(phase1.analyze_result.tokens[token_index])}
					<div class="alert alert-soft {is_error ? 'alert-error' : 'alert-warning'} shadow-lg my-1">
						<div class="flex items-center gap-4">
							<Icon icon="mdi:alert-circle-outline" class="h-5 w-5 min-w-5" />
							<span>{message.message} <sup>(token: "{token}")</sup></span>
							<button onclick={() => phase1.dismiss_message(token_message)} class="btn btn-xs btn-ghost italic">
								Dismiss
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
