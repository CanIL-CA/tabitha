// Types for `import { env } from 'cloudflare:workers'` without the Workers runtime globals: those
// replace the DOM's own `Response`, `Request` and friends, which the apps' client code relies on.
// Each app's worker-configuration.d.ts (`wrangler types --include-runtime=false`) declares
// `Cloudflare.Env` in terms of the binding types below, so they're aliased here from the
// importable module form of @cloudflare/workers-types, which leaves the globals alone.
// No top-level import: that would turn this file into a module, and `declare module` into an
// augmentation of a module that doesn't otherwise exist.

type AnalyticsEngineDataset = import('@cloudflare/workers-types').AnalyticsEngineDataset
type D1Database = import('@cloudflare/workers-types').D1Database
type Fetcher = import('@cloudflare/workers-types').Fetcher
type R2Bucket = import('@cloudflare/workers-types').R2Bucket
type RateLimit = import('@cloudflare/workers-types').RateLimit
type VectorizeIndex = import('@cloudflare/workers-types').VectorizeIndex

declare module 'cloudflare:workers' {
	export const env: Cloudflare.Env
}
