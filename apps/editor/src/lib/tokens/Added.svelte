<script lang="ts">
	import type { CheckerToken } from '@tabitha/types'
	import { token_has_message } from '#lib/token.js'
	import Message from './Message.svelte'
	import TokenDisplay from './TokenDisplay.svelte'

	type Props = {
		token: CheckerToken
	}

	let { token }: Props = $props()
</script>

{#if token_has_message({ token })}
	<Message {token}>
		<span class="text-lg tracking-widest">
			{token.token}
		</span>
	</Message>
{:else}
	<TokenDisplay>
		{token.token}
	</TokenDisplay>
{/if}
