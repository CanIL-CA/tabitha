import { describe, expect, it, vi } from 'vitest'
import { get_request_caller, handle_theme_report, is_theme, record_usage_event, type UsageDataPoint, type UsageDataset } from './index'
import { to_data_point } from './events'

const create_dataset = () => {
	const points: UsageDataPoint[] = []
	const dataset: UsageDataset = { writeDataPoint: point => points.push(point) }
	return { dataset, points }
}

describe('to_data_point', () => {
	it('prefixes every event with its app and kind, and indexes by kind', () => {
		const point = to_data_point({ app: 'ontology', event: { kind: 'theme', theme: 'CanIL Dark' } })

		expect(point).toEqual({ indexes: ['theme'], blobs: ['ontology', 'theme', 'CanIL Dark'], doubles: [] })
	})

	it('lays out a search, normalizing its query and blanking absent optional fields', () => {
		const point = to_data_point({
			app: 'targets',
			event: { kind: 'search', scope: 'target', filter: 'English', q: `  LOVE${'x'.repeat(200)}  `, result_count: 4 },
		})
		const [, , scope, filter, q, note, referred_by] = point.blobs

		expect([scope, filter, note, referred_by]).toEqual(['target', 'English', '', ''])
		expect(q?.startsWith('love')).toBe(true)
		expect(q).toHaveLength(100)
		expect(point.doubles).toEqual([4])
	})

	it('omits the result count for a search that hands off elsewhere', () => {
		const point = to_data_point({ app: 'sources', event: { kind: 'search', scope: 'reference', filter: '', q: 'John 3:16', result_count: null } })

		expect(point.doubles).toEqual([])
	})

	it('lays out a copilot run with its customized profile fields joined', () => {
		const point = to_data_point({
			app: 'copilot',
			event: {
				kind: 'copilot_run',
				caller: 'same-origin',
				run: 'batch',
				book: 'John',
				mode: 'brief',
				lwc: 'Swahili',
				mtt_level: 'high_school',
				sensitivity: 3,
				customized_profile: ['passive', 'honorifics'],
				verse_count: 10,
				error_count: 1,
			},
		})

		expect(point.blobs).toEqual(['copilot', 'copilot_run', 'same-origin', 'batch', 'John', 'brief', 'Swahili', 'high_school', 'passive,honorifics', ''])
		expect(point.doubles).toEqual([10, 1, 3])
	})

	it('lays out checker and AI assist outcomes', () => {
		expect(to_data_point({ app: 'editor', event: { kind: 'check', caller: 'no-origin', status: 'warning', error_count: 0, warning_count: 2, token_count: 9 } }))
			.toEqual({ indexes: ['check'], blobs: ['editor', 'check', 'no-origin', 'warning'], doubles: [0, 2, 9] })
		expect(to_data_point({ app: 'editor', event: { kind: 'ai_assist', status: 'ok', check_status: 'ok', note_count: 2 } }))
			.toEqual({ indexes: ['ai_assist'], blobs: ['editor', 'ai_assist', 'ok', 'ok', ''], doubles: [2] })
	})
})

describe('record_usage_event', () => {
	it('writes the data point to the dataset', () => {
		const { dataset, points } = create_dataset()

		record_usage_event({ dataset, app: 'ontology', event: { kind: 'theme', theme: 'light' } })

		expect(points).toHaveLength(1)
	})

	it('is a no-op without a dataset binding', () => {
		expect(() => record_usage_event({ dataset: undefined, app: 'ontology', event: { kind: 'theme', theme: 'light' } })).not.toThrow()
	})

	it('swallows write failures so the observed request still succeeds', () => {
		const dataset: UsageDataset = { writeDataPoint: () => { throw new Error('blob too large') } }
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

		expect(() => record_usage_event({ dataset, app: 'ontology', event: { kind: 'theme', theme: 'light' } })).not.toThrow()
		expect(warn).toHaveBeenCalled()
	})
})

describe('get_request_caller', () => {
	const request_with = (headers: Record<string, string>) => new Request('https://editor.tabitha.bible/check', { headers })

	it("identifies the app's own pages", () => {
		expect(get_request_caller(request_with({ 'sec-fetch-site': 'same-origin' }))).toBe('same-origin')
	})

	it("identifies another app's pages by their origin", () => {
		expect(get_request_caller(request_with({ 'sec-fetch-site': 'same-site', origin: 'https://sources.tabitha.bible' }))).toBe('sources.tabitha.bible')
	})

	it('labels server-to-server calls', () => {
		expect(get_request_caller(request_with({}))).toBe('no-origin')
	})

	it('labels an unparseable origin', () => {
		expect(get_request_caller(request_with({ origin: 'null' }))).toBe('invalid-origin')
	})
})

describe('is_theme', () => {
	it('accepts known themes only', () => {
		expect(is_theme('dracula')).toBe(true)
		expect(is_theme('not-a-theme')).toBe(false)
		expect(is_theme(undefined)).toBe(false)
	})
})

describe('handle_theme_report', () => {
	const post = (body: string) => new Request('https://ontology.tabitha.bible/usage/theme', { method: 'POST', body })

	it('records a known theme', async () => {
		const { dataset, points } = create_dataset()

		const response = await handle_theme_report({ request: post('{"theme":"nord"}'), dataset, app: 'ontology' })

		expect(response.status).toBe(204)
		expect(points[0]?.blobs).toEqual(['ontology', 'theme', 'nord'])
	})

	it.each(['{"theme":"nope"}', 'not json', ''])('rejects %j without recording', async body => {
		const { dataset, points } = create_dataset()

		const response = await handle_theme_report({ request: post(body), dataset, app: 'ontology' })

		expect(response.status).toBe(400)
		expect(points).toHaveLength(0)
	})
})
