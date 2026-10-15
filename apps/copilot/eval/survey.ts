import type { SurveyDefinition, SurveyEntry, SurveyItem, SurveyOutput, SurveySection, SurveyStat } from '@tabitha/types/survey'
import type { UsageTotals } from './checks'
import type { Report, ReportCase, ReviewNote, ReviewResult } from './data'

// Turns a report into a blinded A/B survey for apps/survey: consultants pick the better output per
// verse and tick problems. apps/survey decides which output shows as A when it publishes.

const MODE_LABELS: Record<string, string> = { discern: 'Semantic notes only', brief: 'Brief' }
const LEVEL_LABELS: Record<string, string> = { grade5: 'Grade 5', high_school: 'High school', undergraduate: 'Undergraduate' }

export function to_survey({ report }: { report: Report }): SurveyDefinition {
	const { baseline, variant, summary } = report
	return {
		title: 'Copilot brief review',
		description: `${summary.cases} verses, each with two copilot outputs made with different settings.`,
		instructions: [
			'Read the verse and both outputs as a translation consultant preparing an MTT would. Which output is which is hidden and changes from verse to verse, so judge only what is on the page.',
			'Pick which output you would rather hand to the translator, or "About the same" when neither is clearly better.',
			'Tick any problems you see in each output, and add a comment for anything specific.',
			"About 10 verses is plenty. Skip any you can't judge, for example Indonesian if you don't read it.",
			'Your answers save as you go. You can close the page and come back to the same link later in this browser.',
		],
		output_names: [baseline.name, variant.name],
		rubric: {
			question: 'Which would you rather hand to the translator?',
			scale: [
				{ label: 'A is clearly better', short: 'A ≫' },
				{ label: 'A is a little better', short: 'A >' },
				{ label: 'About the same', short: '≈' },
				{ label: 'B is a little better', short: '< B' },
				{ label: 'B is clearly better', short: '≪ B' },
			],
			issues: [
				{ key: 'meaning', label: 'Wrong or unsupported meaning' },
				{ key: 'placement', label: 'Content in the wrong section' },
				{ key: 'missing', label: 'Missing something important' },
				{ key: 'level', label: 'Wrong level for the audience' },
				{ key: 'noise', label: 'Padding or repetition' },
			],
			comment_placeholder: 'Anything specific, e.g. "B misreads who is speaking in the quote."',
		},
		results_stats: [
			usage_stat({ label: 'Billed output tokens', usage: summary.usage, pick: totals => totals.billed_output_tokens }),
			usage_stat({ label: 'Thought tokens', usage: summary.usage, pick: totals => totals.thought_tokens }),
			usage_stat({ label: 'Prompt tokens', usage: summary.usage, pick: totals => totals.prompt_tokens }),
			usage_stat({ label: 'Model time (s)', usage: summary.usage, pick: totals => Math.round(totals.duration_ms / 1000) }),
			{ label: 'Automatic warnings', value: `${summary.cases_with_warnings} of ${summary.cases}`, detail: `median word overlap ${summary.median_word_overlap.toFixed(2)}` },
		],
		items: report.cases.map(to_item),
	}
}

function usage_stat({ label, usage, pick }: {
	label: string
	usage: Report['summary']['usage']
	pick: (totals: UsageTotals) => number
}): SurveyStat {
	const before = pick(usage.baseline)
	const after = pick(usage.variant)
	const change = before ? `${after > before ? '+' : ''}${Math.round((after - before) / before * 100)}%` : 'n/a'
	return { label, value: `${before.toLocaleString('en-US')} → ${after.toLocaleString('en-US')}`, detail: change }
}

function to_item(report_case: ReportCase): SurveyItem {
	const { id, reference, lwc, mode, mtt_level, note, english_text, baseline, variant, checks } = report_case
	const lwc_text = lwc === 'English' ? '' : [baseline, variant].map(result => 'lwc_text' in result ? result.lwc_text ?? '' : '').find(Boolean) ?? ''
	const billed = checks.usage

	return {
		key: id,
		title: reference,
		chips: [lwc, MODE_LABELS[mode] ?? mode, LEVEL_LABELS[mtt_level] ?? mtt_level],
		note,
		context: [
			{ label: 'English', text: english_text || '(no English text)' },
			...lwc_text ? [{ label: lwc, text: lwc_text }] : [],
		],
		outputs: [to_output(baseline), to_output(variant)],
		results_notes: [
			`billed output ${billed.baseline.billed_output_tokens.toLocaleString('en-US')} → ${billed.variant.billed_output_tokens.toLocaleString('en-US')}`,
			...checks.warnings,
		],
	}
}

function to_output(result: ReviewResult): SurveyOutput {
	if (result.type === 'error') return { error: result.error }
	if (result.type === 'discern') return { sections: [notes_section(result.notes)] }
	if (!result.tnn_available) {
		return { sections: [notes_section(result.semantic_notes), { title: 'SIL translator notes', entries: [], empty: 'Aquifer has no translator notes for this verse, so the brief stops at the semantic notes.' }] }
	}
	return {
		sections: [
			notes_section(result.semantic_notes),
			{ title: 'SIL translator notes', entries: result.tnn_notes.map(text => [{ text }]), empty: 'None kept.' },
			{ title: 'Cultural & contextual background', entries: result.cultural_background.map(({ term, summary }) => [{ text: term, style: 'strong' }, { text: summary }]), empty: 'None.' },
			{ title: 'Consultant decisions', entries: result.consultant_decisions.map(({ status, text }) => [{ text: status, style: 'label' }, { text }]), empty: 'None.' },
		],
	}
}

function notes_section(notes: ReviewNote[]): SurveySection {
	return { title: 'TaBiThA semantic notes', entries: notes.map(to_note_entry), empty: 'No semantic notes.' }
}

function to_note_entry({ meaning, check, quoted_text, trigger }: ReviewNote): SurveyEntry {
	return [
		{ text: meaning, style: 'strong' },
		{ text: check },
		...quoted_text ? [{ text: quoted_text, style: 'quote' as const }] : [],
		{ text: trigger, style: 'code' },
	]
}
