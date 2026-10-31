<script lang="ts">
	import type { SourceEntity } from '@tabitha/types'
	import { view_settings } from '#lib/settings/settings.svelte.ts'
	import { trim_feature_codes } from '#lib/encoding/features.js'

	let { source_entity }: { source_entity: SourceEntity } = $props()

	let codes_to_display = $derived(
		view_settings.show_feature_codes
			? `${source_entity.noun_list_index ?? ''}${trim_feature_codes(source_entity.feature_codes)}`
			: source_entity.category === 'Noun Phrase' ? source_entity.feature_codes[1] ?? '' : '',
	)
</script>

{#if codes_to_display.length}
	<span>-{codes_to_display}</span>
{/if}
