import type { CopilotEncodingFlag } from '@tabitha/types'

const SIMPLE_ALTERNATE_MARKER = '(Simple)'

// The encoding holds a Simple Vocabulary Alternate as a second copy of the sentence. Unless the
// displayed text carries the inline '(Simple)' marker, the reader never sees that wording, so notes
// about what is inside it only confuse them (or repeat a note about the sentence they do see).
export function drop_hidden_alternate_flags({ flags, displayed_text }: { flags: CopilotEncodingFlag[], displayed_text: string }): CopilotEncodingFlag[] {
	if (displayed_text.includes(SIMPLE_ALTERNATE_MARKER)) {
		return flags
	}

	const hidden_roots = flags.filter(is_simple_alternate).map(flag => flag.encoding_anchor.node_id)
	if (!hidden_roots.length) {
		return flags
	}

	return flags.filter(flag => !hidden_roots.some(root => flag.encoding_anchor.node_id.startsWith(`${root}.`)))
}

function is_simple_alternate(flag: CopilotEncodingFlag): boolean {
	return flag.name === 'Vocabulary Alternate' && flag.value.includes('Simple')
}
