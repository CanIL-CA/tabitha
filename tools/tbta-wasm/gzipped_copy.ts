import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENGINE_OUTPUT_DIR } from './paths'

// Browsers download the engine's binary files from apps/generator, which serves them as static
// assets. Cloudflare doesn't compress .wasm or .sqlite responses, so serve gzipped copies, about a
// fifth of the size, which the browser decompresses itself.
export function write_gzipped_copy({ name }: { name: string }) {
	const path = join(ENGINE_OUTPUT_DIR, name)
	writeFileSync(`${path}.gz`, Bun.gzipSync(readFileSync(path), { level: 9 }))
}
