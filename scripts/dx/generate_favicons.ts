import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_LETTERS, build_cell_svg } from './lib/brand_mark'

const script_dir = dirname(fileURLToPath(import.meta.url))
const root_dir = resolve(script_dir, '../..')

for (const [app, letter] of Object.entries(APP_LETTERS)) {
	const static_dir = join(root_dir, 'apps', app, 'static')
	mkdirSync(static_dir, { recursive: true })
	writeFileSync(join(static_dir, 'favicon.svg'), build_cell_svg({ letter, size: 64 }))
	console.log(`generated apps/${app}/static/favicon.svg ("${letter}")`)
}
