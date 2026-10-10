<script lang="ts">
	import type { CheckerToken } from '@tabitha/types'
	import PopupMenu from './PopupMenu.svelte'
	import Table from './Table.svelte'
	import { Badge } from '#lib/index.js'
	import Icon from '@iconify/svelte'
	import { token_has_message, MESSAGE_TYPE } from '#lib/token.js'
	import type { Snippet } from 'svelte'

	type Props = {
		token: CheckerToken
		children?: Snippet
	}

	let { token, children }: Props = $props()

	const message_ui = {
		[MESSAGE_TYPE.ERROR.label]: { text_class: 'text-error', icon: 'close-circle' },
		[MESSAGE_TYPE.WARNING.label]: { text_class: 'text-warning', icon: 'warning' },
		[MESSAGE_TYPE.SUGGEST.label]: { text_class: 'text-warning', icon: 'lightbulb' },
		[MESSAGE_TYPE.INFO.label]: { text_class: 'text-info', icon: 'information' },
	}
</script>

{#if token_has_message({ token })}
	{@const top_ui = message_ui[token.messages[0].label]}

	<PopupMenu color_classes="bg-base-200 text-base-content">
		{#snippet button_content()}
			<Badge classes="badge-outline px-2 py-5 join-item {top_ui.text_class}">
				<Icon icon="mdi:{top_ui.icon}" class="h-6 w-6" />
				{@render children?.()}
			</Badge>
		{/snippet}

		{#snippet popup_content()}
			<Table entries={token.messages}>
				{#snippet entry_row(entry)}
					{@const { text_class, icon } = message_ui[entry.label]}
					<tr>
						<td class="align-middle">
							<Icon icon="mdi:{icon}" class="h-6 w-6 {text_class}" />
						</td>
						<td>{entry.message}</td>
					</tr>
				{/snippet}
			</Table>
		{/snippet}
	</PopupMenu>
{/if}
