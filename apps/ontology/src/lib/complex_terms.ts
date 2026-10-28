export type SyncComplexTermsResult = {
	count: number
	timestamp: Date
}

export async function sync_complex_terms(): Promise<SyncComplexTermsResult> {
	const res = await fetch('/protected/sync-complex-terms', { method: 'POST' })
	const result = await res.json()

	if (!res.ok || !result.success) {
		throw new Error(result.message || result.error || 'Failed to sync complex terms.')
	}

	return {
		count: result.count,
		timestamp: new Date(result.timestamp),
	}
}
