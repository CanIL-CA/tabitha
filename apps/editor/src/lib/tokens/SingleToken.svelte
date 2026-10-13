<script lang="ts">
	import type { CheckerToken } from '@tabitha/types'
	import type { Component as SvelteComponent } from 'svelte'
	import FunctionWord from './FunctionWord.svelte'
	import Note from './Note.svelte'
	import Punctuation from './Punctuation.svelte'
	import Word from './Word.svelte'
	import Message from './Message.svelte'
	import { TOKEN_TYPE, token_has_message } from '#lib/token.js'

	let { token }: { token: CheckerToken } = $props()

	const component_map = new Map<string, SvelteComponent<{ token: CheckerToken, classes?: string }>>([
		[TOKEN_TYPE.FUNCTION_WORD, FunctionWord],
		[TOKEN_TYPE.NOTE, Note],
		[TOKEN_TYPE.PUNCTUATION, Punctuation],
		[TOKEN_TYPE.LOOKUP_WORD, Word],
	])

	const Component = $derived(component_map.get(token.type))
</script>

{#if token_has_message({ token })}
	<div class="join">
		<Message {token} />
		{#if Component}
			<Component {token} classes="join-item" />
		{/if}
	</div>
{:else if Component}
	<Component {token} />
{/if}