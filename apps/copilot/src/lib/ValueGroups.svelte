<script lang="ts">
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
		options.filter(option => !groups.some(group => group.includes(option.value))),
	)
	let selected_count = $derived(selected_values.length)

	const toggle_selected = (value: string, is_selected: boolean): void => {
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

{#snippet option_list(options: GroupOption[])}
	<ul class="list">
		{#each options as option (option.value)}
			<li class="py-1">
				<label class="label cursor-pointer justify-start">
					<input
						type="checkbox"
						checked={selected_values.includes(option.value)}
						onchange={event =>
							toggle_selected(option.value, event.currentTarget.checked)}
						aria-label={`Select ${option.label()}`}
						class="checkbox checkbox-sm"
					/>
					<span class="text-xs">{option.label()}</span>
				</label>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-sm text-base-content/70">
			Select values, then create a group or move them into an existing group.
		</p>
		<button
			type="button"
			disabled={selected_count === 0}
			onclick={create_group_from_selected}
			class="btn btn-sm"
		>
			Create group from selected
		</button>
	</div>

	<div class="flex gap-2">
		<section aria-labelledby="ungrouped-heading" class="card card-sm card-border bg-base-100">
			<div class="card-body gap-2">
				<div class="card-title flex-wrap justify-between">
					<h2 id="ungrouped-heading">Ungrouped</h2>
					{#if selected_count > 0}
						<button
							type="button"
							onclick={ungroup_selected}
							class="btn btn-ghost btn-xs"
						>
							Ungroup selected
						</button>
					{/if}
				</div>

				{#if ungrouped_options.length > 0}
					{@render option_list(ungrouped_options)}
				{:else}
					<p class="text-xs text-base-content/60">All values are in a group.</p>
				{/if}
			</div>
		</section>

		{#each groups as group, group_index (group_index)}
			{@const group_options = options.filter(option => group.includes(option.value))}
			<section aria-labelledby={`group-heading-${group_index}`} class="card card-sm card-border bg-base-100">
				<div class="card-body gap-2">
					<div class="card-title">
						<button
							type="button"
							disabled={selected_count === 0}
							onclick={() => move_selected_to_group(group_index)}
							class="btn btn-ghost btn-xs"
						>
							Move selected here
						</button>
					</div>

					{@render option_list(group_options)}
				</div>
			</section>
		{/each}
	</div>
</div>
