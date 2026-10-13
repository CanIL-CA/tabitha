import { add_mutation, delete_mutation, get_pending_mutations, update_mutation, type QueuedMutation } from './queue'
import type { OntologyChangeAction, ConceptCreateData, ConceptUpdateData } from '#lib/types.js'

export type MutationOutcome =
	| { type: 'synced', applied: boolean }
	| { type: 'failed', message: string }
	| { type: 'still_pending' }

const submit_urls: Record<OntologyChangeAction, string> = {
	create: '/protected/concept/create/submit',
	update: '/protected/concept/update/submit',
}

let flushing = false

// Processes queued mutations one at a time, in the order they were queued. Stops at the first
// network-level failure rather than trying the rest -- that almost always means we're still
// offline, and the next bootstrap/online trigger will pick up from the top again.
export async function sync_pending(): Promise<Map<string, MutationOutcome>> {
	const outcomes = new Map<string, MutationOutcome>()

	if (flushing) return outcomes
	flushing = true

	try {
		for (const mutation of await get_pending_mutations()) {
			const outcome = await sync_mutation(mutation)
			outcomes.set(mutation.client_id, outcome)

			if (outcome.type === 'still_pending') break
		}
	} finally {
		flushing = false
	}

	return outcomes
}

async function sync_mutation(mutation: QueuedMutation): Promise<MutationOutcome> {
	await update_mutation({ client_id: mutation.client_id, changes: { status: 'syncing' } })

	let res: Response
	try {
		res = await fetch(submit_urls[mutation.action], {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(mutation.body),
		})
	} catch {
		await update_mutation({ client_id: mutation.client_id, changes: { status: 'pending', retry_count: mutation.retry_count + 1 } })
		return { type: 'still_pending' }
	}

	if (!res.ok) {
		const body = await res.json().catch(() => ({}))
		const message = body.message || 'Failed to sync this change.'
		await update_mutation({ client_id: mutation.client_id, changes: { status: 'failed', failure_reason: message } })
		return { type: 'failed', message }
	}

	const { applied } = await res.json()
	await delete_mutation(mutation.client_id)
	return { type: 'synced', applied }
}

// Always records the mutation first, then immediately attempts to flush -- the only difference
// between the online and offline cases is whether that immediate flush succeeds, not a separate
// code path the caller has to think about.
type EnqueueOptions = {
	readonly action: OntologyChangeAction
	readonly body: ConceptCreateData | ConceptUpdateData
}

export async function enqueue({ action, body }: EnqueueOptions): Promise<MutationOutcome> {
	const mutation = await add_mutation({ action, body })
	const outcomes = await sync_pending()
	return outcomes.get(mutation.client_id) ?? { type: 'still_pending' }
}
