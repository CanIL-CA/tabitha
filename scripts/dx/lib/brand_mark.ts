// Shared brand-mark definitions for scripts/dx/generate_favicons.ts and
// scripts/dx/generate_manifest_icons.ts, so both stay in sync (letter-per-app,
// colors) and adding a future app only means adding one entry here.

// Each app's mark: a big initial letter with a small "T" for TaBiThA in the
// atomic-number corner, mirroring the full wordmark treatment in
// packages/ui/src/Brand.svelte. `www` is deliberately excluded: it's the main
// TaBiThA landing page rather than a distinct tool, so its favicon is a
// hand-tuned one-off (apps/www/static/favicon.svg) instead of going through
// this per-app-initial scheme.
export const APP_LETTERS: Record<string, string> = {
	copilot: 'C',
	editor: 'E',
	ontology: 'O',
	sources: 'S',
	targets: 'T',
}

// CANIL's brand red, sampled directly from the pixels of their own favicon
// (https://www.canil.ca/favicon.ico) rather than picked by eye, since TaBiThA is
// joining CANIL as its research and innovation arm. It's a fixed brand color, not
// one of daisyUI's theme tokens, so unlike an in-app UI color it doesn't need a
// separate light/dark variant.
export const CANIL_RED = '#d02031'
export const CANIL_WHITE = '#ffffff'

const FONT_STACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

// Periodic-table cell language: near-square corners, a hairline border, and the
// small mark in the atomic-number position (top-left) instead of a superscript.
// Used as-is for the favicon and for the "any"-purpose manifest icons, since both
// are shown at their own bounds rather than run through an OS mask shape.
export function build_cell_svg({ letter, size }: {
	letter: string
	size: number
}): string {
	const inset = size / 64
	const rx = size / 64 * 4
	const border = size / 64 * 1.5
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
	<rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" rx="${rx}" fill="${CANIL_RED}" stroke="${CANIL_WHITE}" stroke-opacity="0.35" stroke-width="${border}" />
	<text x="${size * 0.156}" y="${size * 0.266}" text-anchor="start" font-family="${FONT_STACK}" font-size="${size * 0.203}" font-weight="500" fill="${CANIL_WHITE}" fill-opacity="0.65">T</text>
	<text x="${size * 0.5}" y="${size * 0.688}" text-anchor="middle" font-family="${FONT_STACK}" font-size="${size * 0.5}" font-weight="700" fill="${CANIL_WHITE}">${letter}</text>
</svg>
`
}

// Maskable variant: full-bleed background (no corner radius or border — the OS
// applies its own mask shape) with the mark kept inside the ~80%-diameter safe
// zone android/other launchers guarantee stays visible after masking.
export function build_maskable_svg({ letter, size }: {
	letter: string
	size: number
}): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
	<rect width="${size}" height="${size}" fill="${CANIL_RED}" />
	<text x="${size * 0.352}" y="${size * 0.381}" text-anchor="start" font-family="${FONT_STACK}" font-size="${size * 0.09}" font-weight="500" fill="${CANIL_WHITE}" fill-opacity="0.65">T</text>
	<text x="${size * 0.5}" y="${size * 0.586}" text-anchor="middle" font-family="${FONT_STACK}" font-size="${size * 0.371}" font-weight="700" fill="${CANIL_WHITE}">${letter}</text>
</svg>
`
}
