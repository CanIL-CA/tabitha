import { sync_complex_terms } from './complex_terms'
import { create_concept_embedder, sync_concept_embeddings, type ConceptIndex, type GatewayEnv } from './concept_embeddings'
import { get_all_concepts } from './ontology'
import type { D1Database } from '@cloudflare/workers-types'

type ScheduledSyncEnv = GatewayEnv & {
	readonly DB_Ontology: D1Database
	readonly VECTORIZE_Concepts: ConceptIndex
}

type ScheduledSyncSummary = {
	readonly complex_terms: number
	readonly embedded: number
	readonly unchanged: number
	readonly failed: number
}

type SchedulerAuthorizationOptions = {
	readonly authorization_header: string | null
	readonly expected_token: string | undefined
}

/**
 * The app's recurring sync, triggered by the `scheduler` Worker's cron (ADR 0018). Embeddings run
 * after complex terms, since how-to hints stand in for the gloss of concepts not yet in the
 * ontology -- but still run if that sync fails, since approved concept edits need embedding either way.
 */
export async function run_scheduled_sync(env: ScheduledSyncEnv): Promise<ScheduledSyncSummary> {
	const db = env.DB_Ontology.withSession()
	const complex_terms = await sync_complex_terms(db).catch((error: unknown) => error)

	const embeddings = await sync_concept_embeddings({
		concepts: await get_all_concepts(db),
		index: env.VECTORIZE_Concepts,
		embedder: create_concept_embedder(env),
	})
	console.info(`Concept embeddings synced: ${embeddings.embedded} embedded, ${embeddings.unchanged} unchanged, ${embeddings.failed} failed`)

	if (typeof complex_terms !== 'number') throw complex_terms

	return { complex_terms, ...embeddings }
}

/**
 * An unset token never authorizes anything, so a missing secret can't be matched by a missing or
 * empty header. The comparison doesn't short-circuit on the first differing character.
 */
export function is_scheduler_authorized({ authorization_header, expected_token }: SchedulerAuthorizationOptions): boolean {
	if (!expected_token) return false

	const expected = `Bearer ${expected_token}`
	const received = authorization_header ?? ''
	if (received.length !== expected.length) return false

	let difference = 0
	for (let i = 0; i < expected.length; i++) {
		difference |= expected.charCodeAt(i) ^ received.charCodeAt(i)
	}
	return difference === 0
}
