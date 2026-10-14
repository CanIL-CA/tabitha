// Vitest runs without the Cloudflare adapter (see index.js), so nothing provides `cloudflare:workers`.
// Unit tests don't touch bindings; this keeps modules that import `env` loadable under Node.
export const env = {}
