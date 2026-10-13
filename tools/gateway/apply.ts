import { desired_gateway_config, gateway_id } from './config'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

export type CloudflareCredentials = {
	account_id: string
	api_token: string
}

/** Idempotently reconciles the shared gateway to `desired_gateway_config`: creates it if it
 * doesn't exist yet, otherwise updates it to match. Safe to run repeatedly. */
export async function reconcile_gateway({ credentials, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	fetch_impl?: typeof fetch
}): Promise<'created' | 'updated'> {
	const exists = await gateway_exists({ credentials, fetch_impl })

	if (exists) {
		await update_gateway({ credentials, fetch_impl })
		return 'updated'
	}

	await create_gateway({ credentials, fetch_impl })
	// The create endpoint doesn't accept every field in desired_gateway_config (see create_gateway
	// below) -- follow up with an update so a freshly provisioned gateway ends up fully reconciled
	// in one `bun run apply`, not two.
	await update_gateway({ credentials, fetch_impl })
	return 'created'
}

async function gateway_exists({ credentials: { account_id, api_token }, fetch_impl }: {
	credentials: CloudflareCredentials
	fetch_impl: typeof fetch
}): Promise<boolean> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/accounts/${account_id}/ai-gateway/gateways/${gateway_id}`, {
		headers: auth_headers(api_token),
	})

	if (response.status === 404) return false
	if (!response.ok) throw new Error(`Failed to check for existing gateway "${gateway_id}": ${response.status} ${await response.text()}`)

	return true
}

async function create_gateway({ credentials: { account_id, api_token }, fetch_impl }: {
	credentials: CloudflareCredentials
	fetch_impl: typeof fetch
}): Promise<void> {
	// `guardrails` isn't a valid create-body field -- cloudflare-go's AIGatewayNewParams omits it
	// entirely, unlike AIGatewayUpdateParams. reconcile_gateway always follows this with
	// update_gateway, which does support it.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- discarding `guardrails`, the field the create endpoint doesn't accept.
	const { guardrails, ...create_body } = desired_gateway_config

	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/accounts/${account_id}/ai-gateway/gateways`, {
		method: 'POST',
		headers: auth_headers(api_token),
		body: JSON.stringify({ id: gateway_id, ...create_body }),
	})

	if (!response.ok) throw new Error(`Failed to create gateway "${gateway_id}": ${response.status} ${await response.text()}`)
}

async function update_gateway({ credentials: { account_id, api_token }, fetch_impl }: {
	credentials: CloudflareCredentials
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/accounts/${account_id}/ai-gateway/gateways/${gateway_id}`, {
		method: 'PUT',
		headers: auth_headers(api_token),
		body: JSON.stringify(desired_gateway_config),
	})

	if (!response.ok) throw new Error(`Failed to update gateway "${gateway_id}": ${response.status} ${await response.text()}`)
}

function auth_headers(api_token: string): HeadersInit {
	return {
		'Authorization': `Bearer ${api_token}`,
		'Content-Type': 'application/json',
	}
}

if (import.meta.main) {
	const account_id = require_env('CLOUDFLARE_ACCOUNT_ID')
	const api_token = require_env('CLOUDFLARE_API_TOKEN')

	const result = await reconcile_gateway({ credentials: { account_id, api_token } })
	console.log(`Gateway "${gateway_id}" ${result}.`)
}

function require_env(key: string): string {
	const value = process.env[key]
	if (!value) throw new Error(`Missing required env var "${key}". Set it in tools/gateway/.env.local.`)
	return value
}
