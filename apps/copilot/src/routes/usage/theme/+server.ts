import { env } from 'cloudflare:workers'
import { handle_theme_report } from '@tabitha/usage'
import type { RequestHandler } from './$types'

export function POST({ request }: Parameters<RequestHandler>[0]) {
	return handle_theme_report({ request, dataset: env.USAGE, app: 'copilot' })
}
