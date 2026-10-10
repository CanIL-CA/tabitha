<script lang="ts">
	import type { CheckerAutoFix, CheckerToken } from '@tabitha/types'
	import PopupMenu from './PopupMenu.svelte'
	import { Badge } from '#lib/index.js'
	import Icon from '@iconify/svelte'
	import { get_remove_auto_fix } from './auto_fix_context'

	type Props = {
		token: CheckerToken
		auto_fix: CheckerAutoFix
	}

	let { token, auto_fix }: Props = $props()

	const remove_auto_fix = get_remove_auto_fix()
</script>

<PopupMenu color_classes="bg-base-200 text-base-content">
	{#snippet button_content()}
		<Badge classes="badge-outline px-2 py-5 text-success">
			<Icon icon="mdi:plus-circle" class="h-6 w-6" />
			<span class="text-lg tracking-widest">{token.token}</span>
		</Badge>
	{/snippet}

	{#snippet popup_content()}
		<div class="grid gap-2 p-2">
			<p>Added for you. {auto_fix.message}</p>
			<button
				type="button"
				onclick={() => remove_auto_fix(auto_fix)}
				class="btn btn-sm btn-ghost justify-self-end"
			>
				Remove
			</button>
		</div>
	{/snippet}
</PopupMenu>
