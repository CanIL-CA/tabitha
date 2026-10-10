<script lang="ts">
	import type { CheckerToken } from '@tabitha/types'
	import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
	import TokenDisplay from './TokenDisplay.svelte'
	import PopupMenu from './PopupMenu.svelte'
	import Table from './Table.svelte'
	import Icon from '@iconify/svelte'
	import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'

	type Props = {
		token: CheckerToken
		classes?: string
	}

	let { token, classes = '' }: Props = $props()
</script>

<PopupMenu>
	{#snippet button_content()}
		<TokenDisplay classes={`L${token.lookup_results[0].level} ${classes}`}>
			{token.token}
		</TokenDisplay>
	{/snippet}

	{#snippet popup_content()}
		<Table entries={token.lookup_results}>
			{#snippet entry_row(entry)}
				{@const show_hints = entry.how_to_entries.length > 0 || LOOKUP_FILTERS.IS_LEVEL_COMPLEX(entry)}

				{#if LOOKUP_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(entry)}
					{@const concept = `${entry.stem}-${entry.sense}`}
					<tr>
						<td class="whitespace-nowrap">
							<span>
								<a href={`${PUBLIC_ONTOLOGY_API_HOST}/?q=${concept}`} target="_blank" class="link not-prose">
									{concept}
								</a>
								{#if entry.case_frame.status === 'valid'}
									<Icon icon="mdi:check-bold" class="h-4 w-4 text-success" />
								{:else if entry.case_frame.status === 'invalid'}
									<Icon icon="mdi:close-thick" class="h-4 w-4 text-error" />
								{/if}
							</span>
						</td>
						<td class="whitespace-nowrap">{entry.part_of_speech}</td>
						<td class="whitespace-nowrap">
							<span class="badge badge-md L{entry.level} font-mono">L{entry.level}</span>
						</td>
						<td>{entry.gloss}</td>
					</tr>
				{:else}
					<tr>
						<td class="whitespace-nowrap">{entry.stem}</td>
						<td class="whitespace-nowrap">{entry.part_of_speech}</td>
						<td>N/A</td>
						<td>Not in Ontology.</td>
					</tr>
				{/if}

				{#if show_hints}
					{@const has_structure = entry.how_to_entries.some(how_to => how_to.structure)}
					{@const has_pairing = entry.how_to_entries.some(how_to => how_to.pairing)}
					{@const has_explication = entry.how_to_entries.some(how_to => how_to.explication)}
					{@const has_any_hint = has_structure || has_pairing || has_explication}
					<tr>
						<td></td>
						<td colspan="3" class="pb-2" class:ps-0={has_any_hint}>
							{#if has_any_hint}
								<Table entries={entry.how_to_entries}>
									{#snippet header_row()}
										<tr>
											{#if has_structure}<th class="text-info-content">Structure</th>{/if}
											{#if has_pairing}<th class="text-info-content">Pairing</th>{/if}
											{#if has_explication}<th class="text-info-content">Explication</th>{/if}
										</tr>
									{/snippet}

									{#snippet entry_row(entry)}
										<tr>
											{#if has_structure}<td>{entry.structure}</td>{/if}
											{#if has_pairing}<td>{entry.pairing}</td>{/if}
											{#if has_explication}<td>{entry.explication}</td>{/if}
											{#if !(entry.structure || entry.pairing || entry.explication)}
												<td>No hints available at this time.</td>
											{/if}
										</tr>
									{/snippet}
								</Table>
							{:else}
								No hints available at this time.
							{/if}
						</td>
					</tr>
				{/if}
			{/snippet}
		</Table>
	{/snippet}
</PopupMenu>
