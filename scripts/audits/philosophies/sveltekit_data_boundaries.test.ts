import { beforeEach, describe, expect, it } from 'bun:test'
import { check_sveltekit_data_boundaries } from './sveltekit_data_boundaries'
import { findings } from './types'

function check({ content, file_path = '/apps/test/Test.svelte' }: { content: string, file_path?: string }) {
	check_sveltekit_data_boundaries({ file_path, lines: content.split('\n') })
	return findings.filter(finding => finding.message.includes('$effect'))
}

describe('check_sveltekit_data_boundaries: async work inside $effect', () => {
	beforeEach(() => {
		findings.length = 0
	})

	it('flags a .then( inside a multi-line effect', () => {
		const content = [
			'$effect(() => {',
			'	load_senses(data).then(senses => all_senses = senses)',
			'})',
		].join('\n')

		const result = check({ content })

		expect(result.map(finding => finding.line_number)).toEqual([2])
		expect(result[0].rule_id).toBe(14)
	})

	it('flags an await inside a timer callback within an effect', () => {
		const content = [
			'$effect(() => {',
			'	const timer = setTimeout(async () => {',
			'		sense = await get_next_sense(concept)',
			'	}, 500)',
			'	return () => clearTimeout(timer)',
			'})',
		].join('\n')

		expect(check({ content }).map(finding => finding.line_number)).toEqual([3])
	})

	it('flags async work in $effect.pre and in a one-line effect', () => {
		const content = [
			'$effect.pre(() => {',
			'	load().then(apply)',
			'})',
			'$effect(() => { load().then(apply) })',
		].join('\n')

		expect(check({ content }).map(finding => finding.line_number)).toEqual([2, 4])
	})

	it('leaves effects without async work alone', () => {
		const content = [
			'$effect(() => {',
			'	if (selected === null) toolbar_id = null',
			'})',
		].join('\n')

		expect(check({ content })).toEqual([])
	})

	it('leaves async work outside effects alone', () => {
		const content = [
			'$effect(() => {',
			'	draw(canvas)',
			'})',
			'',
			'async function on_select() {',
			'	senses = await load_senses(data)',
			'}',
		].join('\n')

		expect(check({ content })).toEqual([])
	})

	it('ignores commented-out async work', () => {
		const content = [
			'$effect(() => {',
			'	// load().then(apply)',
			'})',
		].join('\n')

		expect(check({ content })).toEqual([])
	})

	it('checks rune modules as well as components, but not plain modules', () => {
		const content = '$effect(() => { load().then(apply) })'

		expect(check({ content, file_path: '/apps/test/state.svelte.ts' })).toHaveLength(1)
		findings.length = 0
		expect(check({ content, file_path: '/apps/test/plain.ts' })).toEqual([])
	})
})
