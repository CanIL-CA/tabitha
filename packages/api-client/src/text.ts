// Line breaks become spaces, which keeps every character offset the same as in the author's text
export function sanitize_input_whitespace(text: string): string {
	return text.replaceAll('\n', ' ')
}