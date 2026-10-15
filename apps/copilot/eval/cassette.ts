// Records the pipeline's HTTP inputs (sources and targets APIs, Aquifer) once, then serves them
// back so every variant sees identical inputs and only the model calls go out live.

export type RecordedResponse = {
	url: string
	status: number
	content_type: string
	body: string
}

export function create_recording_fetch({ real_fetch, recorded }: { real_fetch: typeof fetch, recorded: RecordedResponse[] }): typeof fetch {
	return async function recording_fetch(input, init) {
		const response = await real_fetch(input, init)
		const body = await response.clone().text()
		recorded.push({ url: request_url(input), status: response.status, content_type: response.headers.get('content-type') ?? '', body })
		return response
	}
}

// A request to a live origin goes out for real; anything else must have been recorded, so a
// replay can never quietly fetch a fresh (possibly changed) input.
export function create_replay_fetch({ real_fetch, recorded, live_origins }: { real_fetch: typeof fetch, recorded: RecordedResponse[], live_origins: string[] }): typeof fetch {
	const by_url = new Map(recorded.map(response => [response.url, response]))

	return async function replay_fetch(input, init) {
		const url = request_url(input)
		if (live_origins.includes(new URL(url).origin)) return real_fetch(input, init)

		const response = by_url.get(url)
		if (!response) throw new Error(`Eval replay: ${url} was not captured. Run the capture step again.`)
		return new Response(response.body, { status: response.status, headers: { 'content-type': response.content_type } })
	}
}

function request_url(input: RequestInfo | URL): string {
	return input instanceof Request ? input.url : String(input)
}
