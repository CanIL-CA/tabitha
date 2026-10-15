<script lang="ts">
	import type { IssueCount } from '#lib/results.js'

	let { data } = $props()

	const tally = $derived(data.tally)
	const [first_name, second_name] = $derived(data.output_names)

	const signed = (lean: number) => lean > 0 ? `+${lean}` : String(lean)
	const issue_text = (issues: IssueCount[]) => issues.map(({ label, count }) => `${label} ×${count}`).join('; ') || '—'
</script>

<svelte:head>
	<title>Results: {data.title} | Survey | TaBiThA</title>
</svelte:head>

{#snippet stat(label: string, value: string, detail?: string)}
	<div class="stat">
		<div class="stat-title">{label}</div>
		<div class="stat-value text-2xl tabular-nums">{value}</div>
		{#if detail}<div class="stat-desc whitespace-normal">{detail}</div>{/if}
	</div>
{/snippet}

<div class="mx-auto grid max-w-7xl gap-6">
	<header>
		<p class="text-sm font-semibold uppercase tracking-wide opacity-60">Results</p>
		<h1 class="text-3xl font-semibold">{data.title}</h1>
		<p class="opacity-75">{data.description}</p>
		<p class="mt-2">Comparing <strong>{first_name}</strong> (first) with <strong>{second_name}</strong> (second). Positive leans favor the second.</p>
	</header>

	<section aria-label="Answers" class="stats stats-vertical w-full border border-base-300 bg-base-100 lg:stats-horizontal">
		{@render stat('Answers', String(tally.answers), tally.reviewers.map(reviewer => `${reviewer.name} (${reviewer.answered})`).join(', ') || 'No answers yet')}
		{@render stat(`${second_name} preferred`, String(tally.prefer_second), `${tally.clearly_second} clearly`)}
		{@render stat('No preference', String(tally.no_preference))}
		{@render stat(`${first_name} preferred`, String(tally.prefer_first), `${tally.clearly_first} clearly`)}
		{@render stat('Mean lean', tally.mean_lean.toFixed(2), `−${tally.reach} ${first_name} … +${tally.reach} ${second_name}`)}
	</section>

	{#if data.results_stats.length}
		<section aria-label="Publisher's figures" class="stats stats-vertical w-full border border-base-300 bg-base-100 lg:stats-horizontal">
			{#each data.results_stats as figure (figure.label)}
				{@render stat(figure.label, figure.value, figure.detail)}
			{/each}
		</section>
	{/if}

	<section aria-label="By item" class="card card-border bg-base-100">
		<div class="card-body">
			<h2 class="card-title">By item</h2>
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead>
						<tr>
							<th>Item</th>
							<th>{second_name} shown as</th>
							<th>Leans</th>
							<th>Problems in {first_name}</th>
							<th>Problems in {second_name}</th>
							<th>Notes</th>
							<th>Comments</th>
						</tr>
					</thead>
					<tbody>
						{#each tally.items as row (row.key)}
							<tr class="align-top">
								<td>
									<div>{row.title}</div>
									<div class="text-xs opacity-60">{row.chips.join(' · ')}</div>
								</td>
								<td>{row.second_shown_as}</td>
								<td class="font-mono whitespace-nowrap">{row.leans.map(signed).join(' ') || '—'}</td>
								<td>{issue_text(row.issues[0])}</td>
								<td>{issue_text(row.issues[1])}</td>
								<td class="text-warning">{row.results_notes.join('; ') || '—'}</td>
								<td>
									{#each row.comments as { reviewer_name, comment }, comment_index (comment_index)}
										<p><strong>{reviewer_name}:</strong> {comment}</p>
									{/each}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</section>
</div>
