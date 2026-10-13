<script lang="ts">
	import Icon from '@iconify/svelte'
	import { m } from '#lib/paraglide/messages.js'

	type GroupOption = {
		value: string
		label: () => string
	}

	type Props = {
		options: GroupOption[]
		groups: string[][]
	}

	let { options, groups = $bindable() }: Props = $props()
	let selected_values = $state<string[]>([])

	let ungrouped_options = $derived(
		options.filter(option => groups && !groups.some(group => group.includes(option.value))),
	)
	let selected_count = $derived(selected_values.length)

	const toggle_selected = ({ value, is_selected }: {
		value: string
		is_selected: boolean
	}): void => {
		selected_values = is_selected
			? [...selected_values, value]
			: selected_values.filter(selected_value => selected_value !== value)
	}

	const create_group_from_selected = (): void => {
		if (selected_values.length === 0) return

		const selected_value_set = new Set(selected_values)
		const group_values = options
			.filter(option => selected_value_set.has(option.value))
			.map(option => option.value)
		const remaining_groups = groups
			.map(group => group.filter(value => !selected_value_set.has(value)))
			.filter(group => group.length > 0)

		groups = [...remaining_groups, group_values]
		selected_values = []
	}

	const move_selected_to_group = (target_group_index: number): void => {
		if (selected_values.length === 0) return

		const target_group = groups[target_group_index]
		if (!target_group) return

		const selected_value_set = new Set(selected_values)
		const group_values = options
			.filter(option => selected_value_set.has(option.value))
			.map(option => option.value)

		groups = groups
			.map((group, group_index) =>
				group_index === target_group_index
					? [...group.filter(value => !selected_value_set.has(value)), ...group_values]
					: group.filter(value => !selected_value_set.has(value)),
			)
			.filter(group => group.length > 0)
		selected_values = []
	}

	const ungroup_selected = (): void => {
		if (selected_values.length === 0) return

		const selected_value_set = new Set(selected_values)
		groups = groups
			.map(group => group.filter(value => !selected_value_set.has(value)))
			.filter(group => group.length > 0)
		selected_values = []
	}
</script>

{#snippet group_card(options: GroupOption[], group_index: number)}
	{@const heading = group_index === -1 ? m.ungrouped_heading() : m.group_heading()}
	<section class="card card-sm card-border bg-base-100">
		<div class="card-body gap-2">
			<div class="card-title text-sm">{heading}</div>

			<div class="flex flex-col gap-2">
				{#each options as option (option.value)}
					<label class="cursor-pointer justify-start text-xs">
						<input
							type="checkbox"
							checked={selected_values.includes(option.value)}
							onchange={event =>
								toggle_selected({ value: option.value, is_selected: event.currentTarget.checked })}
							class="checkbox checkbox-sm"
						/>
						{option.label()}
					</label>
				{/each}
				
				{#if selected_count > 0}
					{#if group_index === -1}
						<button
							type="button"
							onclick={ungroup_selected}
							class="btn btn-ghost btn-xs justify-start"
						>
							{m.ungroup_selected()}
						</button>
					{:else}
						<button
							type="button"
							disabled={selected_count === 0}
							onclick={() => move_selected_to_group(group_index)}
							class="btn btn-ghost btn-xs justify-start"
						>
							{m.move_selected()}
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</section>
{/snippet}

<div class="flex flex-col gap-3">
	<div class="flex gap-2">
		{@render group_card(ungrouped_options, -1)}

		{#each groups as group, group_index (group_index)}
			{@const group_options = options.filter(option => group.includes(option.value))}
			{@render group_card(group_options, group_index)}
		{/each}

		<div data-tip={m.create_group_tooltip()} class="tooltip mt-3 h-fit">
			<button
				type="button"
				disabled={selected_count === 0}
				onclick={create_group_from_selected}
				class="btn btn-sm"
			>
				<Icon icon="mdi:plus" class="h-5 w-5" />
				{m.create_group()}
			</button>
		</div>
	</div>
</div>
