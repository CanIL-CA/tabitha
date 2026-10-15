import { createInterface } from 'node:readline/promises'
import { run_dev_applications, APPS } from './dev_multi'

type Preset = {
	name: string
	description: string
	apps: string[]
}

const PRESETS: Record<string, Preset> = {
	'1': {
		name: '🌟 All 7 Applications',
		description: 'Full Stack: Editor, Ontology, Sources, Targets, Copilot, Www, Survey',
		apps: ['ontology', 'targets', 'sources', 'editor', 'copilot', 'www', 'survey'],
	},
	'2': {
		name: '📚 Core Linguistics Engine',
		description: 'Ontology + Sources + Targets',
		apps: ['ontology', 'sources', 'targets'],
	},
	'3': {
		name: '✍️  Editor Workbench',
		description: 'Editor + Ontology + Targets',
		apps: ['editor', 'ontology', 'targets'],
	},
	'4': {
		name: '🤖 Copilot AI Lab',
		description: 'Copilot + Sources + Targets + Ontology',
		apps: ['copilot', 'ontology', 'sources', 'targets'],
	},
	'5': {
		name: '🎯 Custom Selection',
		description: 'Pick individual apps',
		apps: [],
	},
}

function print_menu() {
	const preset_entries = Object.entries(PRESETS)
	const name_max_length = Math.max(...preset_entries.map(([, preset]) => preset.name.length))
	const preset_lines = preset_entries
		.toSorted(([index]) => Number(index))
		.map(([index, preset]) => `  [${index}] ${preset.name.padEnd(name_max_length)} (${preset.description})`)

	console.log(`
============================================================
          🚀 TaBiThA Development Server Launcher
============================================================

Select a preset or custom selection:
${preset_lines.join('\n')}
  [0] ❌ Exit
`)
}

async function run_custom_selection(rl: ReturnType<typeof createInterface>): Promise<string[]> {
	const app_infos = Object.values(APPS).toSorted(app => app.index)
	const app_items = app_infos.map(app => `  [${app.index}] ${app.name.padEnd(9)} (:${app.port}) - ${app.desc}`)

	console.log(`
Available Apps:
${app_items.join('\n')}

Enter numbers separated by commas (e.g. 1,4 or 2,3,4):`)

	const answer = (await rl.question('👉 Your selection: ')).trim()
	const map = app_infos.reduce<Record<string, string>>((map, app) => {
		map[`${app.index}`] = app.id
		map[app.id] = app.id
		return map
	}, {})

	const chosen: string[] = []
	const tokens = answer.split(/[,\s]+/)
	for (const t of tokens) {
		const key = map[t.toLowerCase()]
		if (key && !chosen.includes(key)) {
			chosen.push(key)
		}
	}

	return chosen
}

export async function run_dev_menu(preset_argument?: string) {
	if (preset_argument) {
		const preset = PRESETS[preset_argument]
		if (preset?.apps.length) {
			await run_dev_applications(preset.apps)
			return
		}
	}

	if (!process.stdin.isTTY) {
		// Non-interactive environment, launch all
		await run_dev_applications(PRESETS['1'].apps)
		return
	}

	const rl = createInterface({ input: process.stdin, output: process.stdout })
	process.on('SIGINT', () => {
		rl.close()
		process.exit(0)
	})

	try {
		print_menu()
		const choice = (await rl.question('👉 Enter selection [0-5] (default: 1): ')).trim() || '1'

		if (choice === '0' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
			console.log('👋 Bye!')
			rl.close()
			process.exit(0)
		}

		const preset = PRESETS[choice]
		if (preset) {
			const apps = preset.apps.length ? preset.apps : await run_custom_selection(rl)
			rl.close()
			await run_dev_applications(apps)
			return
		}

		console.log(`⚠️  Invalid choice "${choice}". Defaulting to All Applications.`)
		rl.close()
		await run_dev_applications(PRESETS['1'].apps)
	} catch {
		rl.close()
	}
}

if (import.meta.main) {
	await run_dev_menu(process.argv[2])
}
