import { get_all_mutations, type QueuedMutation } from './queue'
import { concepts_match } from '@tabitha/types/patterns'
import { create_change_fields, diff_change_fields } from '#lib/changes.js'
import { decode_categorization_for_update } from '#lib/transformers.js'
import type { Concept, OntologyChange } from '#lib/types.js'
import type { ConceptKey } from '@tabitha/types'

// concept is only needed (and only available) for an update -- a create has nothing on the server yet to diff against.
function to_change({ mutation, concept }: { mutation: QueuedMutation, concept?: Concept }): OntologyChange {
	const change_data = mutation.body
	const { stem, sense, part_of_speech } = change_data

	return {
		id: -1,
		concept: { stem, sense, part_of_speech },
		data: concept
			? diff_change_fields({ change_data, current_data: {
				...concept,
				part_of_speech,
				categories: decode_categorization_for_update({ part_of_speech, categorization: concept.categorization }),
				curated_examples: concept.curated_examples_raw,
			} })
			: create_change_fields(change_data),
		action: mutation.action,
		suggested_by: null,
		approved_by: null,
		applied_date: null,
		version: null,
		is_unsynced: true,
	}
}

// Enriches search results with edits still sitting in this browser's offline queue -- the server
// has no way to know about these since they haven't been sent yet, so this can only happen client-side.
export async function merge_pending_changes(concepts: Concept[]): Promise<Concept[]> {
	const mutations = (await get_all_mutations()).filter(mutation => mutation.action === 'update')
	if (!mutations.length) return concepts

	return concepts.map(concept => {
		const mutation = mutations.find(mutation => concepts_match({ a: mutation.body, b: concept }))
		return mutation
			? { ...concept, pending_changes: [...concept.pending_changes, to_change({ mutation, concept })] }
			: concept
	})
}

// Finds a still-queued edit for one specific concept, e.g. to restore it when reopening its update page.
export async function check_for_pending_change(a_concept: ConceptKey): Promise<QueuedMutation | undefined> {
	const mutations = await get_all_mutations()
	return mutations.find(mutation => mutation.action === 'update' && concepts_match({ a: mutation.body, b: a_concept }))
}

// Queued creates for concepts that don't exist on the server yet -- for the /protected/changes
// audit table, which already knows how to render a 'create' action's field values.
export async function check_for_pending_creates(): Promise<OntologyChange[]> {
	const mutations = (await get_all_mutations()).filter(mutation => mutation.action === 'create')
	return mutations.map(mutation => to_change({ mutation }))
}
