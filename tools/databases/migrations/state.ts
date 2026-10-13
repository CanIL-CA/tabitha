// Tracks which orchestrator steps have already completed for a given migration date, so a run
// interrupted partway through (e.g. a phase throws, or the process is killed) can resume from
// where it left off instead of redoing everything -- including the ~10 minute tbta_utils staging
// step. State lives under raw/, alongside the other per-run artifacts, and is untracked by git.

import { unlink } from 'fs/promises'
import type { TaskId } from './plan'

export type MigrationStep = 'staging' | `${TaskId}:migrated` | `${TaskId}:dumped` | `${TaskId}:deployed`

type State = { completed_steps: MigrationStep[] }

function state_file(date: string): string {
	return `raw/.migration-state-${date}.json`
}

export async function load_state(date: string): Promise<Set<MigrationStep>> {
	const file = Bun.file(state_file(date))
	if (!await file.exists()) return new Set()

	const state = (await file.json()) as State
	return new Set(state.completed_steps)
}

export async function mark_done({ date, step, completed_steps }: {
	date: string
	step: MigrationStep
	completed_steps: Set<MigrationStep>
}): Promise<void> {
	completed_steps.add(step)
	await Bun.write(state_file(date), JSON.stringify({ completed_steps: [...completed_steps] }, null, 2))
}

export async function clear_state(date: string): Promise<void> {
	const file = Bun.file(state_file(date))
	if (await file.exists()) await unlink(state_file(date))
}
