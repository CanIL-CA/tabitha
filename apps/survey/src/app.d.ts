import type { D1Database } from '@cloudflare/workers-types'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			db: D1Database
		}
	}
}

export {}
