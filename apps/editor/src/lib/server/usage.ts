import { expand_token } from '#lib/server/check.js'
import type { CheckEvent } from '@tabitha/usage'
import type { EditorCheckResult } from '@tabitha/types'

export function to_check_event({ result, caller }: { result: EditorCheckResult, caller: string }): CheckEvent {
	const labels = result.tokens.flatMap(expand_token).flatMap(token => token.messages).map(message => message.label)

	return {
		kind: 'check',
		caller,
		status: result.status,
		error_count: labels.filter(label => label === 'error').length,
		warning_count: labels.filter(label => label === 'warning').length,
		token_count: result.tokens.length,
	}
}
