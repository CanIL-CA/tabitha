// D1 rejects a bookmark from any other database ("invalid commitToken bookmark provided"), and each
// Ontology deploy points the binding at a new database. A database switch always ships in a new
// build, so a bookmark is only reused by the build that saved it.
const SEPARATOR = '~'

export function read_bookmark({ cookie, build }: { cookie: string | undefined, build: string }): string | undefined {
	if (!cookie) return undefined

	const [cookie_build, bookmark] = cookie.split(SEPARATOR)
	return cookie_build === build ? bookmark : undefined
}

export function bookmark_cookie({ bookmark, build }: { bookmark: string, build: string }): string {
	return `${build}${SEPARATOR}${bookmark}`
}
