import type { Sentence, Token } from '#lib/types.js'
import type { TokenRule } from '#lib/rules/types.js'
export function rules_applier(rules: TokenRule[]): (sentences: Sentence[]) => Sentence[] {
	return sentences => apply_rules({ sentences, rules })
}

export function apply_rules({ sentences, rules }: { sentences: Sentence[]; rules: TokenRule[] }): Sentence[] {
	return apply_rules_to_tokens({ tokens: sentences.map(sentence => sentence.clause), rules }).map(clause => ({ clause }))

	function apply_rules_to_tokens({ tokens, rules }: { tokens: Token[]; rules: TokenRule[] }): Token[] {
		tokens = tokens.slice()

		for (const rule of rules) {
			tokens = apply_rule_to_tokens({ tokens, rule })
		}

		return tokens
	}
}

export function apply_rule_to_tokens({ tokens, rule }: { tokens: Token[]; rule: TokenRule }): Token[] {
	if (tokens.length === 0) {
		return tokens
	}

	for (let i = 0; i < tokens.length;) {
		tokens[i].sub_tokens = apply_rule_to_tokens({ tokens: tokens[i].sub_tokens, rule })

		if (!rule.trigger(tokens[i])) {
			i++
			continue
		}
		const context_result = rule.context(tokens, i)
		if (!context_result.success) {
			i++
			continue
		}

		const rule_id = `${rule.id} - ${rule.name}`
		tokens[i].applied_rules.push(`trigger - ${rule_id}`)
		i = rule.action({
			tokens,
			trigger_index: i,
			trigger_token: tokens[i],
			rule_id,
			...context_result,
		})
	}

	return tokens
}