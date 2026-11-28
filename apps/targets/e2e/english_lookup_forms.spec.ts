import { expect, test } from '@tabitha/vite-config/playwright'

const test_data = [
	{
		test_word: 'following',
		expected_forms: [
			{ stem: 'following', part_of_speech: 'Adjective', form: 'Stem' },
			{ stem: 'follow', part_of_speech: 'Verb', form: 'Participle' },
		],
	},
	{
		test_word: 'accused',
		expected_forms: [
			{ stem: 'accuse', part_of_speech: 'Verb', form: 'Past' },
			{ stem: 'accuse', part_of_speech: 'Verb', form: 'Perfect' },
		],
	},
	{
		test_word: 'got',
		expected_forms: [
			{ stem: 'get', part_of_speech: 'Verb', form: 'Past' },
			{ stem: 'get off', part_of_speech: 'Verb', form: 'Past' },
			{ stem: 'get up', part_of_speech: 'Verb', form: 'Past' },
			{ stem: 'get on', part_of_speech: 'Verb', form: 'Past' },
		],
	},
	{
		test_word: 'follow*',
		expected_forms: [
			{ stem: 'following', part_of_speech: 'Adjective', form: 'Stem' },
			{ stem: 'follower', part_of_speech: 'Noun', form: 'Stem' },
			{ stem: 'follow', part_of_speech: 'Verb', form: 'Stem' },
			{ stem: 'follower', part_of_speech: 'Noun', form: 'Plural' },
			{ stem: 'follow', part_of_speech: 'Verb', form: 'Past' },
			{ stem: 'follow', part_of_speech: 'Verb', form: 'Perfect' },
			{ stem: 'follow', part_of_speech: 'Verb', form: 'Participle' },
			{ stem: 'follow', part_of_speech: 'Verb', form: 'Third Singular Present' },
		],
	},
	{
		test_word: 'yes',
		expected_forms: [
			{ stem: 'yes', part_of_speech: 'Particle', form: 'Stem' },
		],
	},
	{
		test_word: '500',
		expected_forms: [
			{ stem: '500', part_of_speech: 'Adjective', form: 'Stem' },
		],
	},
	{
		test_word: 'am',
		expected_forms: [],
	},
	{
		test_word: ':',
		expected_forms: [
			{ stem: ':', part_of_speech: 'Particle', form: 'Stem' },
			{ stem: ':', part_of_speech: 'Particle', form: 'Stem' },
		],
	},
	{
		test_word: 'tol*',
		expected_forms: [
			{ stem: 'Tola', part_of_speech: 'Noun', form: 'Stem' },
			{ stem: 'tell', part_of_speech: 'Verb', form: 'Past' },
			{ stem: 'tell', part_of_speech: 'Verb', form: 'Perfect' },
		],
	},
	{
		test_word: 'People',
		expected_forms: [
			{ stem: 'person', part_of_speech: 'Noun', form: 'Plural' },
		],
	},
]

for (const { test_word, expected_forms } of test_data) {
	test(`/English/lookup/forms?word=${test_word}`, async ({ request }) => {
		const response = await request.get(`/English/lookup/forms?word=${test_word}`)
		const returned_forms = await response.json()

		// Row order within the stem and form matches isn't part of the contract, and moves when the Lexicon is rebuilt.
		expect(returned_forms).toHaveLength(expected_forms.length)
		expect(returned_forms).toEqual(expect.arrayContaining(expected_forms.map(form => expect.objectContaining(form))))
	})
}

// Longer than D1's 50-byte limit on a LIKE pattern once wrapped as `%|word|%`
const LONG_WORD = 'the-book-of-the-chronicles-of-the-kings-of-israel'

test('/English/lookup/forms?word=<a word too long for a LIKE pattern>', async ({ request }) => {
	const response = await request.get(`/English/lookup/forms?word=${LONG_WORD}`)

	expect(response.status()).toBe(200)
	expect(await response.json()).toEqual([])
})

test('POST /English/lookup/forms with a word too long for a LIKE pattern', async ({ request }) => {
	const response = await request.post('/English/lookup/forms', { data: { words: [LONG_WORD, 'built'] } })

	expect(response.status()).toBe(200)
	const forms_by_word = await response.json()
	expect(forms_by_word[LONG_WORD]).toEqual([])
	expect(forms_by_word.built).toEqual(expect.arrayContaining([
		expect.objectContaining({ stem: 'build', part_of_speech: 'Verb', form: 'Past' }),
	]))
})
