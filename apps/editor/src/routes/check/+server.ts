import { get_request_caller, record_usage_event } from '@tabitha/usage'
import { run_check, run_check_with_auto_fixes } from '#lib/server/check.js'
import { to_check_event } from '#lib/server/usage.js'

import type { RequestEvent } from './$types'

export async function GET({ url: { searchParams }, request, platform }: RequestEvent) {
	const text = searchParams.get('text') ?? ''
	const check = searchParams.get('auto_fix') === 'on' ? run_check_with_auto_fixes : run_check

	const result = await check(text)

	if (text.trim()) {
		record_usage_event({ dataset: platform?.env.USAGE, app: 'editor', event: to_check_event({ result, caller: get_request_caller(request) }) })
	}

	return Response.json(result)
}
