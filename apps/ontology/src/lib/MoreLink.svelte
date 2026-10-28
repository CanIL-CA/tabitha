<script lang="ts">
	let { remaining, onclick }: { remaining: number, onclick: () => void } = $props()
</script>

<div class="flex justify-center py-4">
	<button type="button" {onclick} class="link link-hover">Show more ({remaining} remaining)</button>
</div>
