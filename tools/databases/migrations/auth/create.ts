import Database from 'bun:sqlite'
import { create_logger } from '../log'

const log = create_logger('Auth migration')

const auth_db = new Database('./raw/Auth.tabitha.sqlite')
create_user_table(auth_db)
create_permissions_table(auth_db)
create_user_permissions_table(auth_db)

auth_db.run('VACUUM')
log.summary()

function create_user_table(db: Database) {
	log.step('Creating Users table...')
	db.run('DROP TABLE IF EXISTS Users')

	db.run(`
		CREATE TABLE IF NOT EXISTS Users (
			id			INTEGER PRIMARY KEY,
			email		TEXT,
			name		TEXT
		)
	`)
}

function create_permissions_table(db: Database) {
	log.step('Creating Permissions table...')
	db.run('DROP TABLE IF EXISTS Permissions')
	db.run(`
		CREATE TABLE IF NOT EXISTS Permissions (
			id				INTEGER PRIMARY KEY,
			app			TEXT,
			permission	TEXT
		)
	`)

	const insert = db.prepare('INSERT OR REPLACE INTO Permissions (id, app, permission) VALUES (?, ?, ?)')
	const insertMany = db.transaction(permissions => {
		for (const permission of permissions) {
			insert.run(...permission)
		}
	})

	insertMany([
		[1, 'ontology', 'PROTECTED_ACCESS'],
		[2, 'ontology', 'ADD_CONCEPT'],
		[3, 'ontology', 'UPDATE_CONCEPT'],
		[4, 'ontology', 'DELETE_CONCEPT'],
	])
}

function create_user_permissions_table(db: Database) {
	log.step('Creating User_Permissions table...')
	db.run('DROP TABLE IF EXISTS User_Permissions')
	db.run(`
		CREATE TABLE IF NOT EXISTS User_Permissions (
			user_id			INTEGER,
			permission_id	INTEGER
		)
	`)
}
