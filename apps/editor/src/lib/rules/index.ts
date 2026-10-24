import { CHECKER_RULES } from './checker_rules'
import { SYNTAX_RULES } from './syntax_rules'
import { LOOKUP_RULES } from './lookup_rules'
import { PART_OF_SPEECH_RULES } from './part_of_speech_rules'
import { apply_rules } from './rules_processor'
import { TRANSFORM_RULES } from './transform_rules'
import { PRONOUN_RULES } from './pronoun_rules'
import { ARGUMENT_AND_SENSE_RULES } from './case_frame'

const RULES = {
	PRONOUN: PRONOUN_RULES,
	LOOKUP: LOOKUP_RULES,
	SYNTAX: SYNTAX_RULES,
	PART_OF_SPEECH: PART_OF_SPEECH_RULES,
	TRANSFORM: TRANSFORM_RULES,
	ARGUMENT_AND_SENSE: ARGUMENT_AND_SENSE_RULES,
	CHECKER: CHECKER_RULES,
}

export {
	apply_rules,
	RULES,
}