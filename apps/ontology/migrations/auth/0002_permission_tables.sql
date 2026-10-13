-- Ontology's permission tables, which get_user_info() reads. Production created them before D1
-- migrations owned DB_Auth, so this is written to change nothing there (IF NOT EXISTS, INSERT OR IGNORE)
-- and to build them from scratch locally. Never drop anything here: User_Permissions holds the real grants.

CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, email TEXT, name TEXT);

CREATE TABLE IF NOT EXISTS Permissions (id INTEGER PRIMARY KEY, app TEXT, permission TEXT);

CREATE TABLE IF NOT EXISTS User_Permissions (user_id INTEGER, permission_id INTEGER);

INSERT OR IGNORE INTO Permissions (id, app, permission) VALUES
	(1, 'ontology', 'PROTECTED_ACCESS'),
	(2, 'ontology', 'ADD_CONCEPT'),
	(3, 'ontology', 'UPDATE_CONCEPT'),
	(4, 'ontology', 'DELETE_CONCEPT');
