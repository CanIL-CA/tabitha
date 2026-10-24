const FIRST_POINT = /(^|\s)1[.)]\s/
const POINT_START = /\s+(?=\d{1,2}[.)]\s+\S)/g

// The model sometimes writes a backslash and an n instead of a line break, and runs numbered
// points together on one line. Both read as one block of text, so split them into lines.
export function split_decision_lines(text: string): string[] {
	const with_breaks = text.replaceAll(String.raw`\n`, '\n')
	const with_points = FIRST_POINT.test(with_breaks) ? with_breaks.replace(POINT_START, '\n') : with_breaks
	return with_points.split('\n').map(line => line.trim()).filter(Boolean)
}
