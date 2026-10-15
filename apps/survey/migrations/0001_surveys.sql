-- A survey and its items are written once, by `bun run publish`. Reviewers only ever add or
-- change their own Reviewers and Responses rows.

CREATE TABLE Surveys (
	id TEXT PRIMARY KEY,
	-- Unlocks the results page, which reveals which output is which.
	results_key TEXT NOT NULL,
	-- What reviewers see of the SurveyDefinition (title, description, instructions, rubric), as JSON.
	review_definition TEXT NOT NULL,
	-- What only the results page shows (output_names, results_stats), as JSON.
	results_definition TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE Items (
	survey_id TEXT NOT NULL REFERENCES Surveys(id),
	key TEXT NOT NULL,
	position INTEGER NOT NULL,
	-- The item as reviewers see it, outputs already in A/B order, as JSON.
	content TEXT NOT NULL,
	-- 1 when A shows the definition's second output. Never sent to reviewers.
	swapped INTEGER NOT NULL,
	-- Results-only notes, as a JSON array.
	results_notes TEXT NOT NULL,
	PRIMARY KEY (survey_id, key)
);

CREATE TABLE Reviewers (
	survey_id TEXT NOT NULL REFERENCES Surveys(id),
	id TEXT NOT NULL,
	name TEXT NOT NULL,
	PRIMARY KEY (survey_id, id)
);

CREATE TABLE Responses (
	survey_id TEXT NOT NULL,
	reviewer_id TEXT NOT NULL,
	item_key TEXT NOT NULL,
	-- How far the reviewer leaned toward A: positive for A, negative for B, 0 for no preference.
	-- NULL until they pick one.
	preference INTEGER,
	-- Issue keys ticked for each side, as JSON arrays.
	issues_a TEXT NOT NULL,
	issues_b TEXT NOT NULL,
	comment TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (survey_id, reviewer_id, item_key),
	FOREIGN KEY (survey_id, reviewer_id) REFERENCES Reviewers(survey_id, id),
	FOREIGN KEY (survey_id, item_key) REFERENCES Items(survey_id, key)
);
