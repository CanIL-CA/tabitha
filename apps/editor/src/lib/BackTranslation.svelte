<script lang="ts">
	import CopyButton from '#lib/CopyButton.svelte'

	type Props = {
		back_translation: string
	}

	let { back_translation }: Props = $props()
</script>

{#if back_translation}
	<div class="prose divider mb-12 mt-20 max-w-none">
		<h2>English back translation</h2>
	</div>

	<section class="mx-auto flex flex-col items-center">
		<p class="prose text-lg max-w-[80ch]">
			{back_translation}
		</p>

		<CopyButton content={back_translation} classes="mt-8 gap-4 self-center">
			Copy back translation
		</CopyButton>
	</section>
{/if}
