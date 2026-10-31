<script lang="ts">
	import Icon from '@iconify/svelte'

	let { count }: { count: number } = $props()
</script>

<div class="indicator">
	{#if count}
		<span title="{count} suggested {count === 1 ? 'change' : 'changes'} you can approve" class="indicator-item badge badge-sm badge-secondary">{count}</span>
	{/if}

	<a href="/protected/changes?status=pending" title="Review Suggested" class="btn btn-primary">
		<Icon icon="material-symbols:published-with-changes" class="w-4 h-4" />
		Review Suggested
	</a>
</div>
