import { TARGET_PROJECTS } from '@tabitha/types/target'

export function GET() {
	return Response.json(TARGET_PROJECTS)
}
