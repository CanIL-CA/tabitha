import type { HandleClientError } from '@sveltejs/kit/hooks'

export const handleError: HandleClientError = ({ error, event }) => {
	console.error('hooks.client.handleError: ', { error, event })
}
