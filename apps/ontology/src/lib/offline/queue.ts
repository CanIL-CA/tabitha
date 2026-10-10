import type { OntologyChangeAction, ConceptCreateData, ConceptUpdateData } from '#lib/types.js'

const DB_NAME = 'tabitha-ontology-offline-queue'
const DB_VERSION = 1
const STORE_NAME = 'mutations'

export type QueuedMutationStatus = 'pending' | 'syncing' | 'failed'

// A not-yet-delivered write request -- the full new record plus delivery bookkeeping (status,
// retry_count). This is the transport-layer view of a "requested change." It's distinct from
// OntologyChange (packages/types/src/ontology.ts), the domain-layer view: a field-level old/value
// diff plus approval/application bookkeeping. Converting one into the other requires a diff against
// a concept's current data (see offline/pending.ts) -- a mutation alone doesn't know what changed.
export type QueuedMutation = {
	client_id: string
	action: OntologyChangeAction
	body: ConceptCreateData | ConceptUpdateData
	status: QueuedMutationStatus
	failure_reason?: string
	retry_count: number
}

function open_db(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE_NAME, { keyPath: 'client_id' })
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

async function with_store<T = undefined>({ mode, fn }: { mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> }): Promise<T> {
	const db = await open_db()
	return new Promise((resolve, reject) => {
		const request = fn(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

// crypto.randomUUID() requires a secure context (https, or the literal hostname "localhost") --
// local dev serves over http on a custom hostname, so fall back to building one manually from
// crypto.getRandomValues(), which isn't secure-context-gated.
function generate_client_id(): string {
	if (typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	bytes[6] = bytes[6] & 0x0f | 0x40 // version 4
	bytes[8] = bytes[8] & 0x3f | 0x80 // variant 10
	const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type AddMutationOptions = {
	readonly action: OntologyChangeAction
	readonly body: ConceptCreateData | ConceptUpdateData
}

export async function add_mutation({ action, body }: AddMutationOptions): Promise<QueuedMutation> {
	const mutation: QueuedMutation = {
		client_id: generate_client_id(),
		action,
		body,
		status: 'pending',
		retry_count: 0,
	}
	await with_store({ mode: 'readwrite', fn: store => store.add(mutation) })
	return mutation
}

export async function get_pending_mutations(): Promise<QueuedMutation[]> {
	const all = await with_store<QueuedMutation[]>({ mode: 'readonly', fn: store => store.getAll() })
	return all.filter(mutation => mutation.status === 'pending')
}

// Every mutation still sitting in the queue at all -- a successful sync deletes its record, so
// anything still here (pending, mid-sync, or rejected by the server) hasn't taken effect yet.
export async function get_all_mutations(): Promise<QueuedMutation[]> {
	return with_store<QueuedMutation[]>({ mode: 'readonly', fn: store => store.getAll() })
}

type UpdateMutationOptions = {
	readonly client_id: string
	readonly changes: Partial<QueuedMutation>
}

export async function update_mutation({ client_id, changes }: UpdateMutationOptions): Promise<void> {
	const db = await open_db()
	await new Promise<void>((resolve, reject) => {
		const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
		const get_request = store.get(client_id) as IDBRequest<QueuedMutation | undefined>
		get_request.onsuccess = () => {
			const existing = get_request.result
			if (!existing) {
				resolve()
				return
			}
			const put_request = store.put({ ...existing, ...changes })
			put_request.onsuccess = () => resolve()
			put_request.onerror = () => reject(put_request.error)
		}
		get_request.onerror = () => reject(get_request.error)
	})
}

export async function delete_mutation(client_id: string): Promise<void> {
	await with_store({ mode: 'readwrite', fn: store => store.delete(client_id) })
}
