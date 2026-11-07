// Proof of concept: verse text generation through apps/generator (TBTA's engine as WebAssembly).

// A service binding ignores the host, but fetch() needs an absolute URL.
const GENERATOR_URL = 'https://generator.internal'

// TBTA numbers books in canonical order: Genesis = 1 ... Revelation = 66.
const BIBLE_BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation']

// Workers' Fetcher and the DOM's fetch disagree on Request/Response types though they're the same
// objects at runtime, so accept plain objects (as @tabitha/api-client's ServiceBinding does).
export type GeneratorBinding = {
	fetch(input: string, init?: object): Promise<object>
}

export function bible_book_number(book_name: string) {
	const index = BIBLE_BOOKS.findIndex(name => name.toLowerCase() === book_name.toLowerCase())
	return index === -1 ? undefined : index + 1
}

export async function generate_verse_text({ generator, book, chapter, verse, encoding, previous_encoding, audience }: {
	generator: GeneratorBinding
	book: number
	chapter: number
	verse: number
	encoding: string
	previous_encoding: string
	audience: number
}) {
	const response = await generator.fetch(`${GENERATOR_URL}/generate`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ book, chapter, verse, encoding, previous_encoding, audience }),
	}) as Response
	return { status: response.status, body: await response.json() as { text?: string, error?: string } }
}

// The engine's files, for browsers that run it themselves (see engine_worker.ts).
export async function fetch_engine_file({ generator, name, if_none_match }: { generator: GeneratorBinding, name: string, if_none_match: string | null }) {
	const headers: Record<string, string> = if_none_match ? { 'if-none-match': if_none_match } : {}
	return await generator.fetch(`${GENERATOR_URL}/files/${encodeURIComponent(name)}`, { headers }) as Response
}

// The engine's first generation in a fresh Worker takes seconds; warming it when a verse page
// opens usually hides that wait.
export async function warm_generator({ generator }: { generator: GeneratorBinding }) {
	await generator.fetch(`${GENERATOR_URL}/warm`, { method: 'POST' }).catch(() => undefined)
}
