import { create_token_filter } from '#lib/rules/rules_parser.js'
import { create_lookup_result, create_token, TOKEN_TYPE } from '#lib/token.js'
import { find_enclosing_np_start, get_np_head } from './phrase_helpers'
import type { NounListEntry, EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence, Token } from '#lib/types.js'
import type { TokenFilter } from '#lib/rules/types.js'

const PUNCTUATION_PARTICLES: Array<[string, TokenFilter]> = [
	['exclamation', create_token_filter({ 'token': '!' })],
	['-QuoteBegin', create_token_filter({ 'token': '"', 'tag': { 'quote': 'begin' } })],
	['-QuoteEnd', create_token_filter({ 'token': '"' })],
	['-CommentBegin', create_token_filter({ 'token': '(comment-begin)|(begin-comment)' })],
	['-CommentEnd', create_token_filter({ 'token': '(comment-end)|(end-comment)' })],
]

export const PUNCTUATION_PARTICLE_STEMS = new Set(PUNCTUATION_PARTICLES.map(([stem]) => stem))

export function replace_punctuation(sentences: Sentence[]): Sentence[] {
	return replace_punctuation_tokens(sentences.map(sentence => sentence.clause)).map(clause => ({ clause }))

	function replace_punctuation_tokens(tokens: Token[]): Token[] {
		return tokens.map(replace_punctuation_token)
	}

	function replace_punctuation_token(token: Token): Token {
		if (token.sub_tokens.length) {
			token.sub_tokens = replace_punctuation_tokens(token.sub_tokens)
			return token
		}
		
		const particle_entry = PUNCTUATION_PARTICLES.find(([, filter]) => filter(token))
		if (particle_entry) {
			const [stem] = particle_entry
			return {
				...token,
				token: stem,
				type: TOKEN_TYPE.LOOKUP_WORD,
				lookup_results: [create_lookup_result({ stem, part_of_speech: 'Particle', sense: 'A', ontology_status: 'in ontology' })],
			}
		}
		return token
	}
}

const GENERIC_GENITIVE = '-Generic Genitive'

// these relations are differentiated by the structure, and marked in the transform rules
const NOUN_REALTIONS_STRUCTURAL: Array<[string, TokenFilter, 'replace' | 'insert']> = [
	[GENERIC_GENITIVE, create_token_filter({ 'tag': { 'relation': 'genitive_norman' } }), 'replace'],
	[GENERIC_GENITIVE, create_token_filter({ 'tag': { 'relation': 'genitive_saxon' } }), 'insert'],
	['-Name', create_token_filter({ 'tag': { 'relation': 'name' } }), 'replace'],
	['-Title', create_token_filter({ 'tag': { 'relation': 'title' } }), 'insert'],
	['-Subgroup', create_token_filter({ 'tag': { 'relation': 'subgroup' } }), 'replace'],
	['-Made of', create_token_filter({ 'tag': { 'relation': 'made_of' } }), 'insert'],
	['-Group', create_token_filter({ 'tag': { 'relation': 'group' } }), 'replace'],
	['-Kind of', create_token_filter({ 'tag': { 'relation': 'kind' } }), 'replace'],
]

const BODY_PART_STEMS = 'arm|back|blood|body|bone|chest|eye|face|feather|finger|foot|forehead|hair|hand|head|heart|heel|hip|horn|knee|leg|lip|mouth|neck|nose|shoulder|skin|stomach|toe|wing'
const KINSHIP_STEMS = 'ancestor|baby|brother|child|cousin|daughter|daughter-in-law|descendant|family|father|Father|father-in-law|grandchild|grandfather|grandson|husband|mother|mother-in-law|parent|relative|sister|son|Son|uncle|wife'
const OWNER_STEMS = `animal|arrow|awl|axe|bag|bandage|barley|barn|basket|bed|bedroom|beer|belt|bleach|board|boat|book|booth|bowl|box|bread|brick|bucket|building|bull|bush|
cage|calf|camel|chicken|clinic|cloth|clothes|club|coat|coffin|coin|comb|condom|container|couch|crop|cross|crown|cup|curtain|dock|dog|dollar|donkey|door|doorframe|dough|dove
|dress|duck|egg|farm|fence|field|fig|fish|floor|flour|food|fruit|garden|gate|gem|gift|glass|glove|goat|gold|grape|grass|grave|helmet|hen|herb|horse|house|idol|incense|jar|
key|knife|lamb|land|letter|livestock|load|loaf|machine|manger|manna|mat|meat|money|myrrh|nail|necklace|needle|net|oil|oven|ox|paint|palace|paper|pearl|pen|pen|penny|perfume|
pig|pillow|pitcher|pitchfork|plate|pot|present|purse|rag|ring|robe|room|rooster|rope|safe|sail|sandal|scepter|shawl|sheep|sheet|shield|ship|shirt|shoe|silver|sling|soap|spear
|sponge|staff|statue|store|sword|table|tablet|teaspoon|tent|thing|throne|tool|towel|treasury|trumpet|wealth|wine|wire|wood`.replaceAll('\n', '')

// these relations have 'genitive_norman' or 'genitive_saxon' structure, and are differentiated only by the words they modify
const NOUN_REALTIONS_CONTEXTUAL: Array<[string, { head: TokenFilter, modified?: TokenFilter }]> = [
	['-Body Part', {
		head: create_token_filter({ 'stem': BODY_PART_STEMS }),
	}],
	['-Kinship', {
		head: create_token_filter({ 'stem': KINSHIP_STEMS }),
	}],
	['-Kinship', {
		head: create_token_filter({ 'stem': 'person' }),
		modified: token => !['God', 'king'].includes(token.lookup_results[0].stem),
	}],
	['-Owner', {
		head: create_token_filter({ 'stem': OWNER_STEMS }),
	}],
	['-Part Whole', {
		head: create_token_filter({ 'stem': 'bottom|side|top' }),
	}],
	['-Quantity', {
		head: create_token_filter({ 'stem': 'gram|jar|kilogram|liter|loaf' }),
	}],
	['-Quantity-Distance', {
		head: create_token_filter({ 'stem': 'meter' }),
	}],
	['-Realm of Authority', {
		head: create_token_filter({ 'stem': 'governor|king|leader|prince|ruler' }),
		modified: create_token_filter({ 'stem': 'Egyptian|Israelite|Philistine' }),
	}],
	['-Region of Authority', {
		head: create_token_filter({ 'stem': 'emperor|governor|king|leader|prince|ruler' }),
		modified: token => !['king'].includes(token.lookup_results[0].stem),
	}],
]

export function replace_or_insert_noun_relations(sentences: Sentence[]): Sentence[] {
	return replace_relation_tokens(sentences.map(sentence => sentence.clause)).map(clause => ({ clause }))

	function replace_relation_tokens(tokens: Token[]): Token[] {
		return tokens.flatMap((token, index) => replace_relation_token({ token, tokens, index }))
	}

	function replace_relation_token({ token, tokens, index }: { token: Token, tokens: Token[], index: number }): Token[] {
		if (token.sub_tokens.length) {
			token.sub_tokens = replace_relation_tokens(token.sub_tokens)
			return [token]
		}
		// a phrase's relation tag describes the whole phrase, and the relation word inside it is what gets replaced
		if (token.type === TOKEN_TYPE.PHRASE) return [token]

		const relation_entry = NOUN_REALTIONS_STRUCTURAL.find(([, filter]) => filter(token))
		if (!relation_entry) {
			return [token]
		}

		const [relation_stem,, action] = relation_entry
		const stem = relation_stem === GENERIC_GENITIVE
			? find_contextual_relation({ tokens, index }) ?? relation_stem
			: relation_stem

		if (action === 'replace') {
			return [{
				...token,
				token: stem,
				type: TOKEN_TYPE.LOOKUP_WORD,
				lookup_results: [create_lookup_result({ stem, part_of_speech: 'Adposition', sense: 'A', ontology_status: 'in ontology' })],
			}]
		} else {
			return [
				create_token({
					token: stem,
					type: TOKEN_TYPE.LOOKUP_WORD,
					lookup_results: [create_lookup_result({ stem, part_of_speech: 'Adposition', sense: 'A', ontology_status: 'in ontology' })],
					tag: { 'relation': token.tag['relation'], 'pre_np_adposition': 'relation' },
				}),
				token,
			]
		}
	}
}

type RelationPosition = { tokens: Token[], index: number }

function find_contextual_relation({ tokens, index }: RelationPosition): string | undefined {
	const head = find_head({ tokens, index })
	if (!head) return undefined
	const modified = find_modified({ tokens, index })

	const contextual_entry = NOUN_REALTIONS_CONTEXTUAL.find(([, { head: is_head, modified: is_modified }]) => {
		if (!is_head(head)) return false
		if (!is_modified) return true
		return modified !== null && is_modified(modified)
	})
	return contextual_entry?.[0]
}

export function find_head({ tokens, index }: RelationPosition): Token | null {
	const modifier_np_start = find_enclosing_np_start({ tokens, index })
	if (modifier_np_start < 0) return null
	const head_np_start = find_enclosing_np_start({ tokens, index: modifier_np_start })
	if (head_np_start < 0) return null
	return get_np_head({ tokens, np_start_index: head_np_start })
}

export function find_modified({ tokens, index }: RelationPosition): Token | null {
	const modifier_np_start = find_enclosing_np_start({ tokens, index })
	if (modifier_np_start < 0) return null
	return get_np_head({ tokens, np_start_index: modifier_np_start })
}

export function assign_noun_list_indexes(entities: EditorAnalyzedEntity[]) {
	const noun_list: NounListEntry[] = []

	entities.forEach(entity => {
		if (!entity.concept || entity.concept.part_of_speech !== 'Noun') {
			return
		}
		const current_noun = `${entity.concept.stem}-${entity.concept.sense}`

		const existing = noun_list.filter(({ noun }) => noun === current_noun)
		let noun_list_index: string
		if (entity.noun_list_index) {
			const index = parseInt(entity.noun_list_index)
			if (index > existing.length) {
				noun_list_index = next_noun_index()
				noun_list.push({ index: noun_list_index, noun: current_noun })
			} else {
				noun_list_index = existing[index - 1].index
			}
		} else if (existing.length) {
			noun_list_index = existing[existing.length - 1].index
		} else {
			noun_list_index = next_noun_index()
			noun_list.push({ index: noun_list_index, noun: current_noun })
		}

		entity.noun_list_index = noun_list_index
	})

	return entities

	function next_noun_index(): string {
		const next = noun_list.length + 1
		if (next >= 10) {
			// index 10 and up use capital letters starting with A (ascii 65)
			return String.fromCharCode(65 + next - 10)
		} else {
			return next.toString()
		}
	}
}