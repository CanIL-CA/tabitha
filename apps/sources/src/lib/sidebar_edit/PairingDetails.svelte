<script lang="ts">
	import ConceptDialog from '#lib/ConceptDialog.svelte'
	import ConceptDetails from '#lib/sidebar/ConceptDetails.svelte'
	import { IS_CARDINAL_NUMBER } from '@tabitha/types/patterns'
	import type { OntologyResult, SourceEntity, PairingType } from '@tabitha/types'
	import type { PageSourceConcept } from '#lib/types.js'
	import Icon from '@iconify/svelte'

	let { data = $bindable() }: { data: SourceEntity } = $props()

	let pairing_concept = $derived<PageSourceConcept>(data.pairing_concept ?? {
		stem: '',
		sense: '',
		part_of_speech: data.concept!.part_of_speech,
	})

	let pairing_type = $derived<PairingType>(data.pairing_type ?? 'simple-complex')

	let ontology_filter = $derived.by<((result: OntologyResult) => boolean) | undefined>(() => {
		if (pairing_type === 'simple-complex') {
			return result => ['2', '3'].includes(result.level)
		} else if (pairing_type === 'metric-biblical') {
			if (pairing_concept.part_of_speech === 'Noun') {
				return result => result.gloss.startsWith('(biblical unit)')
			} else if (pairing_concept.part_of_speech === 'Adjective') {
				return result => IS_CARDINAL_NUMBER.test(result.stem)
			}
		}
		return undefined
	})

	let dialog_open = $state(false)

	function open_dialog(pairing_char: PairingType) {
		pairing_type = pairing_char
		dialog_open = true
	}

	function close_dialog() {
		dialog_open = false
		if (pairing_concept.stem) {
			data.pairing_concept = pairing_concept
			data.pairing_type = pairing_type
		}
	}

	function remove_pairing() {
		data.pairing_concept = null
		data.pairing_type = null
	}
</script>

{#snippet display_pairing_type(type: PairingType)}
	{#if type === 'simple-complex'}
		<Icon icon="mdi:puzzle-outline" class="h-4 w-4" />
		<!-- or mdi:hexagon-multiple-outline -->
		Simple-Complex
	{:else if type === 'dynamic-literal'}
		<Icon icon="mdi:lightning-bolt-outline" class="h-4 w-4" />
		Dynamic-Literal
	{:else if type === 'metric-biblical'}
		<Icon icon="mdi:ruler" class="h-4 w-4" />
		Metric-Biblical Units
	{/if}
{/snippet}

{#if data.pairing_concept}
	<div class="flex gap-1 mb-2 p-1 items-center font-semibold border border-base-300 rounded-sm">
		{@render display_pairing_type(pairing_type)}
	</div>
	<ConceptDetails bind:data={data.pairing_concept}>
		{#snippet actions()}
			<button onclick={() => open_dialog(pairing_type)} class="btn btn-xs">
				Change <Icon icon="mdi:edit-outline" class="h-4 w-4" />
			</button>
			<button onclick={remove_pairing} class="btn btn-xs">
				Remove <Icon icon="material-symbols:cancel-outline" class="h-4 w-4" />
			</button>
		{/snippet}
	</ConceptDetails>
{:else}
	<button onclick={() => open_dialog('simple-complex')} class="btn btn-sm">
		{@render display_pairing_type('simple-complex')}
	</button>
	<button onclick={() => open_dialog('dynamic-literal')} class="btn btn-sm">
		{@render display_pairing_type('dynamic-literal')}
	</button>
	{#if ['Noun', 'Adjective'].includes(pairing_concept.part_of_speech)}
		<button onclick={() => open_dialog('metric-biblical')} class="btn btn-sm">
			{@render display_pairing_type('metric-biblical')}
		</button>
	{/if}
{/if}

{#if dialog_open}
	<ConceptDialog bind:concept={pairing_concept} onclose={close_dialog} filter={ontology_filter} />
{/if}
