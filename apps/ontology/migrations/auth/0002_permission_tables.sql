-- Ontology's permission tables, which is_authorized() reads. Production created them before D1
-- migrations owned DB_Auth, so this is written to change nothing there (IF NOT EXISTS, INSERT OR IGNORE)
-- and to build them from scratch locally. Never drop anything here: User_Permissions holds the real grants.

create table if not exists Users (email text primary key, name text);

create table if not exists Permissions (id integer primary key, app text, permission text);

create table if not exists User_Permissions (user_email text, permission_id integer);

insert or ignore into Permissions (id, app, permission) values
	(1, 'ontology', 'PROTECTED_ACCESS'),
	(2, 'ontology', 'ADD_CONCEPT'),
	(3, 'ontology', 'UPDATE_CONCEPT'),
	(4, 'ontology', 'DELETE_CONCEPT');
