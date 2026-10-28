import { describe, expect, it } from 'bun:test'
import { examples_drop_problem } from './examples'

describe('examples_drop_problem', () => {
	it('refuses a rebuild that produced no examples', () => {
		expect(examples_drop_problem({ live_count: 1000, rebuilt_count: 0 })).toMatch(/no examples/)
	})

	it('accepts a rebuild that grew or lost only a little', () => {
		expect(examples_drop_problem({ live_count: 1000, rebuilt_count: 1500 })).toBeNull()
		expect(examples_drop_problem({ live_count: 1000, rebuilt_count: 850 })).toBeNull()
	})

	it('refuses a rebuild that lost more than a fifth of the live examples, naming both counts', () => {
		const problem = examples_drop_problem({ live_count: 1000, rebuilt_count: 700 })

		expect(problem).toContain('30.0%')
		expect(problem).toContain('1,000')
		expect(problem).toContain('700')
	})

	it('accepts any non-empty rebuild when the live table has no examples yet', () => {
		expect(examples_drop_problem({ live_count: 0, rebuilt_count: 10 })).toBeNull()
	})
})
