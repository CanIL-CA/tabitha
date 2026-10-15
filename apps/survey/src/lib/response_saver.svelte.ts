import type { ReviewResponse } from './types'

const SAVE_DELAY_MS = 600

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Saves each change shortly after the reviewer stops typing or clicking, one request at a time
 * so an older save can never land after a newer one. */
export class ResponseSaver {
	status = $state<SaveStatus>('idle')
	message = $state('')

	#survey_id: string
	#pending = new Map<string, ReviewResponse>()
	#timer: ReturnType<typeof setTimeout> | undefined
	#chain: Promise<void> = Promise.resolve()

	constructor(survey_id: string) {
		this.#survey_id = survey_id
	}

	queue(response: ReviewResponse) {
		this.#pending.set(response.item_key, response)
		clearTimeout(this.#timer)
		this.#timer = setTimeout(() => this.flush(), SAVE_DELAY_MS)
	}

	flush() {
		clearTimeout(this.#timer)
		const batch = [...this.#pending.values()]
		this.#pending.clear()
		if (!batch.length) return this.#chain

		this.status = 'saving'
		this.#chain = this.#chain.then(async () => {
			for (const response of batch) await this.#post(response)
		})
		return this.#chain
	}

	async #post(response: ReviewResponse) {
		try {
			const result = await fetch(`/r/${this.#survey_id}/responses`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(response),
			})
			if (!result.ok) throw new Error(((await result.json().catch(() => null)) as { message?: string } | null)?.message ?? `Save failed (${result.status})`)
			this.status = 'saved'
			this.message = ''
		} catch (error) {
			// Kept for the next flush, unless a newer change to the same item is already queued.
			if (!this.#pending.has(response.item_key)) this.#pending.set(response.item_key, response)
			this.status = 'error'
			this.message = error instanceof Error ? error.message : 'Save failed'
		}
	}
}
