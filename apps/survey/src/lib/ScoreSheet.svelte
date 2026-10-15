<script lang="ts">
	import type { SurveyRubric } from '@tabitha/types/survey'
	import { MAX_COMMENT_LENGTH, preference_at } from './responses'
	import type { ReviewResponse, Side } from './types'

	type Props = {
		rubric: SurveyRubric
		response: ReviewResponse
		onchange: (response: ReviewResponse) => void
	}

	let { rubric, response, onchange }: Props = $props()

	const SIDES: Side[] = ['a', 'b']

	function toggle_issue({ side, key, ticked }: { side: Side, key: string, ticked: boolean }) {
		const others = response.issues[side].filter(existing => existing !== key)
		onchange({ ...response, issues: { ...response.issues, [side]: ticked ? [...others, key] : others } })
	}
</script>

<section aria-label="Your score" class="card card-border bg-base-100">
	<div class="card-body gap-5">
		<fieldset class="fieldset">
			<legend class="fieldset-legend text-base">{rubric.question}</legend>
			<div class="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
				{#each rubric.scale as choice, index (choice.label)}
					{@const preference = preference_at({ rubric, index })}
					<label title={choice.label} class="btn h-auto flex-col gap-0 py-2 font-normal has-checked:btn-primary">
						<input
							type="radio"
							name="preference-{response.item_key}"
							checked={response.preference === preference}
							onchange={() => onchange({ ...response, preference })}
							class="sr-only" />
						<strong>{choice.short}</strong>
						<span class="text-xs">{choice.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if rubric.issues.length}
			<div class="grid gap-4 md:grid-cols-2">
				{#each SIDES as side (side)}
					<fieldset class="fieldset">
						<legend class="fieldset-legend {side === 'a' ? 'text-info' : 'text-warning'}">Problems in {side.toUpperCase()}</legend>
						{#each rubric.issues as issue (issue.key)}
							<label class="label text-base-content">
								<input
									type="checkbox"
									checked={response.issues[side].includes(issue.key)}
									onchange={event => toggle_issue({ side, key: issue.key, ticked: event.currentTarget.checked })}
									class="checkbox checkbox-sm" />
								{issue.label}
							</label>
						{/each}
					</fieldset>
				{/each}
			</div>
		{/if}

		<label class="fieldset">
			<span class="fieldset-legend">Comment (optional)</span>
			<textarea
				value={response.comment}
				maxlength={MAX_COMMENT_LENGTH}
				placeholder={rubric.comment_placeholder}
				oninput={event => onchange({ ...response, comment: event.currentTarget.value })}
				class="textarea w-full"></textarea>
		</label>
	</div>
</section>
