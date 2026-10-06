import type { OntologyChange, OntologyChangeDataFields, ConceptCreateData, ConceptUpdateData, ApplyPendingResult } from '$lib/types'

// fetch()'s res.json() leaves dates as strings, unlike SvelteKit's own load-data serialization, which revives them automatically.
function revive_dates(raw: OntologyChange): OntologyChange {
	return {
		...raw,
		suggested_by: raw.suggested_by && { ...raw.suggested_by, date: new Date(raw.suggested_by.date) },
		approved_by: raw.approved_by && { ...raw.approved_by, date: new Date(raw.approved_by.date) },
		applied_date: raw.applied_date && new Date(raw.applied_date),
	}
}

export async function approve_change(id: number): Promise<OntologyChange> {
	const res = await fetch(`/protected/changes/${id}/approve`, { method: 'POST' })
	const result = await res.json()

	if (!res.ok) {
		throw new Error(result.message || 'Failed to approve the change.')
	}

	return revive_dates(result.change)
}

export async function apply_pending_changes(): Promise<ApplyPendingResult> {
	const res = await fetch('/protected/changes/apply-pending', { method: 'POST' })
	const result = await res.json()

	if (!res.ok) {
		throw new Error(result.message || 'Failed to apply pending changes.')
	}

	return {
		count: result.count,
		failed: result.failed,
		version: result.version,
		timestamp: new Date(result.timestamp),
		changes: result.changes.map(revive_dates),
	}
}

const DIFFED_FIELDS: (keyof OntologyChangeDataFields)[] = ['level', 'gloss', 'brief_gloss', 'categories', 'curated_examples'] as const

// only record the fields that actually changed
export function diff_change_fields({ change_data, current_data }: { change_data: ConceptUpdateData, current_data: ConceptUpdateData }): OntologyChangeDataFields {
	return Object.fromEntries(
		DIFFED_FIELDS.flatMap(field => {
			const old = current_data[field]
			const value = change_data[field]
			return old?.toString() !== value?.toString() ? [[field, { old, value }]] : []
		}),
	)
}

// a create has no "old" value to diff against.
export function create_change_fields(change_data: ConceptCreateData): OntologyChangeDataFields {
	const { level, gloss, brief_gloss, categories } = change_data
	return {
		level: { value: level },
		gloss: { value: gloss },
		...brief_gloss ? { brief_gloss: { value: brief_gloss } } : {},
		categories: { value: categories },
	}
}

// Create a filter for checking if a change was made between two Ontology versions.
// 'since' is exclusive and 'before' is inclusive
export function change_made_between_versions({ since, before }: { since: string, before: string }): (change: OntologyChange) => boolean {
	if (since === 'all' && before === 'all') {
		return () => true
	}
	const since_number = since === 'all' ? 0 : version_as_number(since)
	const before_number = before === 'all' ? Number.MAX_VALUE : version_as_number(before)
	return change => {
		if (!change.version || change.version === 'Failed') {
			return false
		}
		const as_number = version_as_number(change.version)
		return as_number > since_number && as_number <= before_number
	}

	function version_as_number(version: string): number {
		const [major, minor, patch] = version.split('.').map(Number)
		return major * 10_000_000 + minor * 10_000 + patch
	}
}

export async function get_next_sense({ stem, part_of_speech }: { stem: string, part_of_speech: string }): Promise<string> {
	const res = await fetch(`/protected/concept/create/next-sense?stem=${stem}&part_of_speech=${part_of_speech}`)
	const { next_sense } = await res.json()
	return next_sense
}
