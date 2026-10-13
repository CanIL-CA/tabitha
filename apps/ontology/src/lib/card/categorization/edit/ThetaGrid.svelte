<script lang="ts">
	import { theta_grid_arguments } from '#lib/lookups.js'
	import type { PartOfSpeech } from '@tabitha/types'

	type Props = {
		categories?: string[]
		part_of_speech?: PartOfSpeech
	}

	let { categories = $bindable([]) }: Props = $props()
</script>

<fieldset class="fieldset border border-base-300 rounded-box p-4">
	<legend class="fieldset-legend font-semibold">Theta Grid</legend>

	<table>
		<tbody>
			{#each theta_grid_arguments as argument, i}
				<tr>
					<td>
						{argument}
					</td>
					<td class="pl-4">
						<select bind:value={categories[i]} name="categories[]" class="select w-35">
							<option value="">---</option>
							<option value={argument}>Required</option>
							<option value="({argument})">Optional</option>
						</select>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</fieldset>
