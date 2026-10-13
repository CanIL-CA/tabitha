<script lang="ts">
	import { usage_info } from '#lib/lookups.js'
	import type { PartOfSpeech } from '@tabitha/types'

	type Props = {
		part_of_speech: PartOfSpeech
		categories?: string[]
		offset?: number
	}

	let { part_of_speech, categories = $bindable([]), offset = 0 }: Props = $props()

	let usages = $derived(usage_info[part_of_speech] || [])
</script>

<fieldset class="fieldset border border-base-300 rounded-box p-4">
	<legend class="fieldset-legend font-semibold">Usage Info</legend>

	{#each usages as usage, i}
		<div class="flex items-center gap-2 my-1">
			<select bind:value={categories[i + offset]} name="categories[]" class="select w-32">
				<option value="never {usage}">Never</option>
				<option value="sometimes {usage}">Sometimes</option>
				<option value="always {usage}">Always</option>
			</select>
			<span>{usage}</span>
		</div>
	{/each}
</fieldset>
