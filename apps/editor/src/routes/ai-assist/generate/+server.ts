import { record_usage_event } from '@tabitha/usage'
import { create_editor_ai_client } from '#lib/server/ai_assist/client.js'
import { generate_phase_1 } from '#lib/server/ai_assist/index.js'

import type { RequestEvent } from './$types'

export async function POST({ request, platform }: RequestEvent) {
	const { text } = await request.json()

	const result = await generate_phase_1({ text: text ?? '', ai: create_editor_ai_client() })

	record_usage_event({
		dataset: platform?.env.USAGE,
		app: 'editor',
		event: { kind: 'ai_assist', status: result.status, check_status: result.check.status, note_count: result.notes.length, message: result.message },
	})

	return Response.json(result)
}
