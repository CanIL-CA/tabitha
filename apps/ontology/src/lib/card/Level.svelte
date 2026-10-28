<script lang="ts">
	import { levels } from '#lib/lookups.js'

	type Props = {
		level: string
		tooltip_dir?: string
	}

	let { level, tooltip_dir = 'tooltip-left' }: Props = $props()

	const other_level_info: Record<string, [string, string]> = {
		'N/A': ['Not in the ontology', 'badge-error'],
		FW: ['Function Word', 'badge-neutral'],
	}

	let [description, level_class] = $derived(
		levels.has(level)
			? [levels.get(level) || '', `L${level}`]
			: other_level_info[level] || ['', 'badge-neutral'],
	)
	let level_display = $derived(Number(level) >= 0 ? `L${level}` : level)
</script>

<span class="badge {level_class} badge-lg tooltip {tooltip_dir} font-mono" data-tip={description}>
	{level_display}
</span>
