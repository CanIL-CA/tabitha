import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'
import type { PartOfSpeech } from '@tabitha/types'
import type { Tag, Token } from '#lib/types.js'

export const word = ({ stem, part_of_speech, tag = {} }: { stem: string; part_of_speech: PartOfSpeech; tag?: Tag }) => create_token({
	token: stem,
	type: TOKEN_TYPE.LOOKUP_WORD,
	lookup_results: [create_lookup_result({ stem, part_of_speech, sense: 'A' })],
	tag,
})
export const phrase = ({ type, tag = {}, contents }: { type: string; tag?: Tag; contents: Token[] }) => [
	create_token({ token: `{${type}`, type: TOKEN_TYPE.PHRASE, tag }),
	...contents,
	create_token({ token: '}', type: TOKEN_TYPE.PHRASE }),
]
export const np = ({ role, contents }: { role?: string; contents: Token[] }) => phrase({ type: 'NP', tag: role ? { role } : {}, contents })
export const vp = (stem: string) => phrase({ type: 'VP', contents: [word({ stem, part_of_speech: 'Verb' })] })
export const clause = ({ clause_type, sub_tokens }: { clause_type: string; sub_tokens: Token[] }) => create_token({ token: '[', type: TOKEN_TYPE.CLAUSE, tag: { clause_type }, sub_tokens })
