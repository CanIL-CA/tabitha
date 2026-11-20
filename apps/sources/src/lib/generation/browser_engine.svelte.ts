// Runs TBTA's generation engine in this browser, in engine_worker.ts. One engine per tab: it stays
// loaded while the user moves between verses.
import type { GenerationJob } from '#lib/generation/verse_generation.js'

export type EngineRequest =
	| { kind: 'load' }
	| { kind: 'generate', id: number, job: GenerationJob, audience: number }

export type EngineResponse =
	| { kind: 'ready', load_ms: number }
	| { kind: 'load_failed', error: string }
	| { kind: 'result', id: number, text?: string, error?: string, ms: number }

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'failed'

export type BrowserGeneration = { text?: string, error?: string, ms: number }

class BrowserEngine {
	status = $state<EngineStatus>('idle')
	load_error = $state('')
	load_ms = $state(0)

	#worker: Worker | undefined
	#pending = new Map<number, (result: BrowserGeneration) => void>()
	#next_id = 0

	load() {
		if (this.status === 'loading' || this.status === 'ready') return
		this.status = 'loading'
		this.load_error = ''
		this.#worker ??= this.#start_worker()
		this.#send({ kind: 'load' })
	}

	generate({ job, audience }: { job: GenerationJob, audience: number }) {
		const id = this.#next_id++
		const result = new Promise<BrowserGeneration>(resolve => this.#pending.set(id, resolve))
		this.#send({ kind: 'generate', id, job, audience })
		return result
	}

	#start_worker() {
		const worker = new Worker(new URL('./engine_worker.ts', import.meta.url), { type: 'module' })
		worker.addEventListener('message', (event: MessageEvent<EngineResponse>) => this.#receive(event.data))
		worker.addEventListener('error', () => this.#fail({ error: 'The engine could not start in this browser.' }))
		return worker
	}

	#send(request: EngineRequest) {
		this.#worker?.postMessage(request)
	}

	#receive(response: EngineResponse) {
		if (response.kind === 'ready') {
			this.status = 'ready'
			this.load_ms = response.load_ms
			return
		}
		if (response.kind === 'load_failed') return this.#fail({ error: response.error })
		this.#pending.get(response.id)?.({ text: response.text, error: response.error, ms: response.ms })
		this.#pending.delete(response.id)
	}

	#fail({ error }: { error: string }) {
		this.status = 'failed'
		this.load_error = error
		for (const resolve of this.#pending.values()) resolve({ error, ms: 0 })
		this.#pending.clear()
	}
}

export const browser_engine = new BrowserEngine()
