import type { AiClient } from '@tabitha/ai'

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			ai: AiClient
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {}
