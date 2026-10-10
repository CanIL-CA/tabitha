import { check_input_safety as check_input_safety_shared } from '@tabitha/ai'

// Scoped to the one place user text actually reaches the model: the ai-assist textarea, which
// should only ever contain English scripture text to encode. See @tabitha/ai's input_guard for
// why this check exists at all.
const MAX_LENGTH = 2000

/** Returns a user-facing rejection message if `text` looks unsafe to send to the model, or
 * `undefined` if it's fine. */
export function check_input_safety(text: string): string | undefined {
	return check_input_safety_shared({
		text,
		max_length: MAX_LENGTH,
		too_long_message: `Text is too long (${text.length} characters, max ${MAX_LENGTH}) -- enter a single verse or short passage.`,
		suspicious_message: 'This text looks like it might contain instructions rather than scripture to encode. Please enter plain English text only.',
		log_label: 'ai-assist',
	})
}
