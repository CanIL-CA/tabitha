// @ts-check

/**
 * Single source of truth for every app's dedicated local dev-server port. These numbers are
 * chosen, not arbitrary, so each entry carries the reason for its own number right next to it
 * instead of letting that drift into a comment somewhere else. Each app's vite.config.js feeds
 * its `port:` option from here rather than restating the literal.
 *
 * The `ref` values are deliberately obscured; run scripts/dx/gematria.ts to read them.
 *
 * @type {Record<string, { port: number, emoji: string, ref: string }>}
 */
export const PORTS = {
	editor: {
		port: 1337,
		emoji: '🕶️',
		ref: 'y33g — gur syntfuvc ncc trgf gur syntfuvc ahzore',
	},
	copilot: {
		port: 9000,
		emoji: '🔴',
		ref: 'UNY 9000 — "V\'z fbeel Qnir, V\'z nsenvq V pna\'g qb gung"',
	},
	sources: {
		port: 1947,
		emoji: '📜',
		ref: 'Gur Qrnq Frn Fpebyyf, qvfpbirerq ng Dhzena',
	},
	targets: {
		port: 1382,
		emoji: '🪶',
		ref: 'Gur Jlpyvssr Ovoyr — svefg Ratyvfu genafyngvba bs gur jubyr Ovoyr',
	},
	ontology: {
		port: 3056,
		emoji: '📖',
		ref: 'Fgebat\'f T3056: λόγος (ybtbf), "jbeq" — Wbua 1:1 va n cbeg ahzore',
	},
	www: {
		port: 1455,
		emoji: '🖨️',
		ref: 'Gur Thgraoret Ovoyr — Fpevcgher zrrgf gur cevagvat cerff',
	},
	survey: {
		port: 1086,
		emoji: '📋',
		ref: 'Gur Qbzrfqnl Obbx — Jvyyvnz gur Pbadhrebe\'f terng fheirl bs Ratynaq, 1086',
	},
}
