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

		expect(returned_forms).toMatchObject(expected_forms)
	})
}
