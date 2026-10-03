<svelte:head>
	<title>Developers — TaBiThA</title>
	<meta
		name="description"
		content="Everything is one open-source monorepo, and most of the data is queryable without an API key."
	/>
</svelte:head>

<a href="/" class="back-link">← Home</a>

<div class="page-kicker">For developers</div>
<h1>Developers</h1>
<p class="page-dek">
	Everything is one open-source monorepo, and most of the data is queryable without an API key.
</p>

<div class="page-body">
	<p>
		The whole project lives at
		<a href="https://github.com/CanIL-CA/tabitha">github.com/CanIL-CA/tabitha</a> — one
		repository, several deployed apps, each with its own README documenting its API in detail.
		Sources, Ontology, Targets, and the AI copilot each expose a public, read-only HTTP API with no
		API key or authentication required.
	</p>

	<h2>Sources</h2>
	<p>
		Semantic representations of the source text, browsable by book, chapter, and verse, and
		queryable as JSON — e.g. <code>sources.tabitha.bible/Bible/John/1/1</code>. Lives at
		<code>apps/sources</code>.
	</p>

	<h2>Ontology</h2>
	<p>
		The database of source concepts behind every semantic representation — concept search,
		complex-term hints, and usage examples. Lives at <code>apps/ontology</code>, served at
		<a href="https://ontology.tabitha.bible">ontology.tabitha.bible</a>.
	</p>

	<h2>Targets</h2>
	<p>
		Generated text for each target language and project, with the same book/chapter/verse
		hierarchy and full-text search. Lives at <code>apps/targets</code>, served at
		<a href="https://targets.tabitha.bible">targets.tabitha.bible</a>.
	</p>

	<h2>Editor</h2>
	<p>
		Where a linguist builds and checks a semantic representation — grammar/rule validation,
		backtranslation, and an AI-assist endpoint that drafts a first-pass encoding from plain
		English, routed through Cloudflare's AI Gateway. Lives at <code>apps/editor</code>, served at
		<a href="https://editor.tabitha.bible">editor.tabitha.bible</a>.
	</p>

	<h2>Copilot</h2>
	<p>
		An AI layer on top of a finished target translation — notes, warnings, and suggestions for a
		given verse, plus a chapter-level SFM export a translation team can pull straight into their
		own tools. Also routed through Cloudflare's AI Gateway. Lives at <code>apps/copilot</code>,
		served at <a href="https://copilot.tabitha.bible">copilot.tabitha.bible</a>.
	</p>

	<p>
		Each app's README documents its endpoints, query parameters, and examples in full. If
		something's unclear or missing, issues and pull requests are welcome.
	</p>
</div>

<nav class="page-siblings">
	<a href="/how-it-works">How does it work? →</a>
	<a href="/workflows">Workflows →</a>
</nav>
