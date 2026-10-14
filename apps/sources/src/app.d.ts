import type { D1DatabaseSession } from '@cloudflare/workers-types'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: D1DatabaseSession
		}
		// interface PageData {}
	}
}

export {}
