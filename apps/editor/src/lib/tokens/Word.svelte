<script lang="ts">
	import type { CheckerToken } from '@tabitha/types'
	import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
	import NotFound from './NotFound.svelte'
	import Result from './Result.svelte'

	type Props = {
		token: CheckerToken
		classes?: string
	}

	let { token, classes = '' }: Props = $props()
</script>

{#if token.lookup_results.some(LOOKUP_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY)}
	<Result {token} {classes} />
{:else}
	<NotFound {token} {classes} />
{/if}