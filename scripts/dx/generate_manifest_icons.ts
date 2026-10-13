import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { APP_LETTERS, build_cell_svg, build_maskable_svg } from './lib/brand_mark'

const script_dir = dirname(fileURLToPath(import.meta.url))
const root_dir = resolve(script_dir, '../..')

// Standard PWA install/home-screen sizes. "any" icons keep the favicon's cell
// look (border, rounded corners); "maskable" is full-bleed so OS icon masks
// (circle, squircle, etc.) don't clip the mark.
const ANY_SIZES = [192, 512]
const MASKABLE_SIZE = 512

async function write_png({ svg, size, out_path }: {
	svg: string
	size: number
	out_path: string
}) {
	await sharp(Buffer.from(svg), { density: 384 })
		.resize(size, size)
		.png()
		.toFile(out_path)
}

for (const [app, letter] of Object.entries(APP_LETTERS)) {
	const static_dir = join(root_dir, 'apps', app, 'static')
	mkdirSync(static_dir, { recursive: true })

	for (const size of ANY_SIZES) {
		const out_path = join(static_dir, `icon-${size}.png`)
		await write_png({ svg: build_cell_svg({ letter, size }), size, out_path })
	}

	const maskable_path = join(static_dir, `icon-maskable-${MASKABLE_SIZE}.png`)
	await write_png({ svg: build_maskable_svg({ letter, size: MASKABLE_SIZE }), size: MASKABLE_SIZE, out_path: maskable_path })

	console.log(`generated apps/${app}/static/icon-{192,512,maskable-512}.png ("${letter}")`)
}
