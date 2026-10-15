import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { track_scripture_view } from './fums'

// A browser with just enough of window and document for the tracker: the page's scripts, and the
// queue and function the tracker installs on window

type FakeBrowser = {
	readonly window: { fumsData?: unknown[][], fums?: (...args: unknown[]) => void }
	readonly scripts: { src: string }[]
}

function install_fake_browser({ loaded_scripts = [] }: { loaded_scripts?: string[] } = {}): FakeBrowser {
	const scripts = loaded_scripts.map(src => ({ src }))
	const window: FakeBrowser['window'] = {}

	vi.stubGlobal('window', window)
	vi.stubGlobal('document', {
		querySelector: (selector: string) => scripts.find(({ src }) => selector.includes(src)) ?? null,
		createElement: () => ({ src: '' }),
		head: { append: (script: { src: string }) => scripts.push(script) },
	})

	return { window, scripts }
}

const TRACKER_URL = 'https://pkg.api.bible/fumsV3.min.js'

let browser: FakeBrowser

beforeEach(() => {
	browser = install_fake_browser()
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('track_scripture_view', () => {
	it('queues a view for the tracker to replay once it has loaded', () => {
		track_scripture_view('token-1')

		expect(browser.window.fumsData).toEqual([['trackView', 'token-1']])
	})

	it('queues every view it is given, in order', () => {
		track_scripture_view('token-1')
		track_scripture_view('token-2')

		expect(browser.window.fumsData).toEqual([['trackView', 'token-1'], ['trackView', 'token-2']])
	})

	it('adds the tracker script to the page', () => {
		track_scripture_view('token-1')

		expect(browser.scripts.map(({ src }) => src)).toEqual([TRACKER_URL])
	})

	it('adds the tracker script only once, however many views it tracks', () => {
		track_scripture_view('token-1')
		track_scripture_view('token-2')

		expect(browser.scripts).toHaveLength(1)
	})

	it("doesn't add the script when the page already has it", () => {
		browser = install_fake_browser({ loaded_scripts: [TRACKER_URL] })

		track_scripture_view('token-1')

		expect(browser.scripts).toHaveLength(1)
	})

	it('hands the view to a tracker that has already installed its own function', () => {
		const views: unknown[][] = []
		browser.window.fums = (...args) => void views.push(args)

		track_scripture_view('token-1')

		expect(views).toEqual([['trackView', 'token-1']])
	})
})
