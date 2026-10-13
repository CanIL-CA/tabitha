import { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET } from '$env/static/private'
import { create_http_client, type HttpClient } from '@tabitha/api-client'
import type { PassageReference, VerseReference } from '@tabitha/types'
import { extractRawText } from 'mammoth'

export type ChapterReference = {
	book: string
	chapter: number
}

export type ZohoVerseData = {
	verse: VerseReference
	he1?: string
	he2: string
	back_translation: string
	complex_concepts: string[]
}

const zoho_workdrive_client = create_http_client({ base_url: 'https://www.zohoapis.com/workdrive/api/v1', cache: true })
const zoho_writer_client = create_http_client({ base_url: 'https://www.zohoapis.com/writer/api/v1' })

const bible_book_folder_ids = new Map([
	['Exodus', 'qb3n3defc164225244492ab902e8b57dd5635'],
	['Leviticus', '77zqlcd88222e5f154d328f2bf3e0569babce'],
	['Numbers', '0o65zbefb8dd7808e4bef95d9c8292c5d6a3c'],
	['Deuteronomy', '77zql94e48ead7f6d4306a5b408bee5c2b13f'],
	['Ruth', 'n3kdqd3d8a0057d9d4478a2e2506e9d305414'],
	['2 Kings', 'rfzkz8606a90ce3d84e4bb146faf76da19bb1'],
	['1 Chronicles', '76fn268a6892a725142a9aa97b3b2c0d32258'],
	['Ezra', 'nj3qvce5426e28d2643f5b7fffff28e7e481f'],
	['Psalms', '8h8j55d73d90b097a4708bdba409578c7873b'],
	['Proverbs', 'o3xue0cb77899b95e4bb69d834c7159d4e625'],
	['Ecclesiastes', '3n7mu0ad7be58471e4c3eb9eb50d10d6ef2cc'],
	['Isaiah', 'jnise5e33014515784a98bca94013cd4a5f53'],
	['Jeremiah', '3n7mue0b6acb9f72e4ddfaf2f39d5715e0dcd'],
	['Hosea', '7mke63f3d222f86c046d4af70745bc7d36d0a'],
	['Joel', 'dtr3v356525d072984cc9a9883c86c76f0ec4'],
	['Obadiah', '7mke6c4fe32d2ee4a4d2cac373c55278e1fc6'],
	['Micah', '9i94kb7a6a724d2854c5cbb9cb37419f7030b'],
	['Habakkuk', 'r3jz3ef00985405d947eda17c36e71560fc15'],
	['Haggai', 'drybafcb0c77d116e44dc911220250de08b45'],
	['Zechariah', 'lcjcef547d6aa14ba421691294fccdc5720fb'],
	['Malachi', 'j8p4l91557f3ead7f47cd9c78a6990be68998'],

	['Matthew', 'n3kdqc4b68b123da342adac059328f17ae1ee'],
	['Mark', 'n3kdqa04fb674cf35462bb0c0b56a226f104f'],
	['Luke', 'n3kdq74b596ee52db4363a4ea4769ab1e37dc'],
	['John', 'n3kdqb573017a57054818ba71f379a1bb3e15'],
	['Acts', 'dp9bd298877718f5d4ce29f4664eaf8fa2d4d'],
	['Romans', 'ompifb9d9b04862534c80a4313a0db0d73060'],
	['1 Corinthians', '369lb0bd118470a7541a3be852488910bd594'],
	['2 Corinthians', 't0q889d59964f8eb9411ea85b84314608fc21'],
	['Galatians', 'rdoup2b99f6f73abf4b44a18f8edf3e032143'],
	['Ephesians', 'nj3qvccf8c121212e4ca3a8f0febdffc91a49'],
	['Philippians', '05i8l9d83a54a0ec444169b52d1530f432851'],
	['1 Thessalonians', 'u4z5h6bd290ab68f442bda1d91d99c1c1f32c'],
	['2 Thessalonians', 'mx1z9940b96bd37574d4d9f579ff36ed7f8a7'],
	['1 Timothy', 'grd1k8f693696def14fd6ab8b0b48a8e6b664'],
	['2 Timothy', 'tpo0d1d16d4cd78234593a3522fe137a6c370'],
	['Titus', 'pizen8becce383d394a46b90881fa972ee843'],
	['Philemon', 'nqmmne10676d9104a4fb0b4c2c6bdc5825633'],
	['Hebrews', 'jnise4062e932a6204e08b25eb3a515c7d178'],
	['James', '4duk6c4628e0313684594a6c29168d5fda7d2'],
	['1 Peter', 's8lep65a682674a3b4416910827eba82a2abd'],
	['2 Peter', 'uev0ba9dfd6854b5c4c4781a991bcb61da918'],
	['1 John', '7egg2d594529846dc445da23ab067eb1353d8'],
	['3 John', '369lb6f23ed5128104899b62b628e3f7b2019'],
	['Jude', 'u335rf23c8c521d8e406e8244444630bd5cc2'],
	['Revelation', 'c15kv5fd21dbc0fe24ccbb7564afdf76954c8'],
])

export async function get_all_verses_in_chapter(chapter_reference: ChapterReference): Promise<ZohoVerseData[]> {
	const chapter_files = await find_files_for_chapter(chapter_reference)
	if (!chapter_files.length) {
		console.info(`No Zoho files found for ${chapter_reference.book} ${chapter_reference.chapter}.`)
		return []
	}
	const data: ZohoVerseData[] = []
	for (const file of chapter_files) {
		console.info(`Extracting verses from '${file.name}'...`)
		data.push(...await extract_all_verses_from_file(file, chapter_reference))
	}
	return data
}

const CHAPTER_FOLDER_REGEX = /[^\d]*(\d+)$/
async function find_files_for_chapter(chapter_reference: ChapterReference): Promise<ZohoFilesInfo[]> {
	const { book, chapter } = chapter_reference
	const book_folder_id = bible_book_folder_ids.get(book)
	if (!book_folder_id) {
		console.info(`No folder for ${book} exists in Zoho`)
		return []
	}
	let book_files = await list_folder_contents(book_folder_id)

	const chapter_folder = book_files.filter(f => f.type === 'folder').find(f => {
		const match = f.name.match(CHAPTER_FOLDER_REGEX)
		return match && Number(match[1]) === chapter
	})
	
	if (chapter_folder) {
		book_files = await list_folder_contents(chapter_folder.id)
	}

	return book_files.filter(file => file.type === 'writer')
		.map(file => ({
			...file,
			passage: parse_passage_from_file({
				filename: file.name,
				book,
				chapter: chapter_folder ? chapter : undefined,
			}),
		}))
		.filter(file => file.passage?.chapter === chapter)
}

function document_is_new_format(text: string) {
	return text.includes('{HE')
}

const VERSE_REGEX = new RegExp(String.raw`(\d+)\s+{HE ?1}(.*?){HE ?2}(.*?)(?:{EBT}(.*?))?(?:{CC}(.*?))?$`, 'si')
export async function extract_all_verses_from_file(file: ZohoFilesInfo, chapter: ChapterReference): Promise<ZohoVerseData[]> {
	const file_text = await download_file(file.id)

	if (!file_text) {
		console.warn(`'${file.name}' could not be downloaded from Zoho`)
		return []
	}

	// expect the new format, because only 'in-progress' chapters will be fetched, and none of the old format are still in progress
	if (!document_is_new_format(file_text)) {
		console.warn(`'${file.name}' does not contain the new format. Cannot extract verses.`)
		return []
	}

	const verse_parts = file_text.split(/\n\\V/i).slice(1)
	const data: ZohoVerseData[] = []
	for (const verse_section of verse_parts) {
		const match = verse_section.match(VERSE_REGEX)
		if (!match) {
			console.warn(`Unexpected verse format in '${file.name}'. Could not extract: ${verse_section.slice(0, 50)}`)
			continue
		}
		const verse = { ...chapter, verse: Number(match[1]) }
		data.push({
			verse,
			he1: match[2]?.trim() ?? '',
			he2: match[3]?.replace(/^\s*-( drafter)?/, '').trim() ?? '',
			back_translation: match[4]?.trim() ?? '',
			complex_concepts: match[5]?.split('|').map(cc => cc.trim()).filter(cc => cc) ?? '',
		})
	}

	return data
}

// function extract_verse_in_old_format({ text, reference }: { text: string, reference: VerseReference }): ZohoVerseData | undefined {
// 	console.log(`[Zoho] extracting from old format...`)
// 	const { chapter, verse } = reference
// 	const verse_regex = new RegExp(String.raw`\n(?:${chapter}:${verse}|${verse})(\S.*?)\n\n(\S.*?)(?:Complex concepts:(.*?))?\n\n`, 'si')
// 	const match = text.match(verse_regex)
// 	if (!match) {
// 		return undefined
// 	}

// 	return {
// 		verse: reference,
// 		he2: match[1].trim(),
// 		back_translation: match[2].replace('English:', '').replace(`\\v ${verse} `, '').trim(),
// 		complex_concepts: match[3]?.split(/[\n|]/).map(cc => cc.trim()).filter(cc => cc) ?? [],
// 	}
// }

const ZOHO_FILE_REGEX = /.+?(?:(\d+)(?:[ _:](\d+)-(\d+))|(\d+)-(\d+)|(\d+))$/
function parse_passage_from_file({ filename, book, chapter }: { filename: string, book: string, chapter?: number }): PassageReference | undefined {
	// 'Zechariah 3_1-5'
	// 'Obadiah 15-21'
	// 'Malachi 4'
	// '3 John_1-15'
	// 'Galatians 5:13-26'
	const match = filename.match(ZOHO_FILE_REGEX)
	if (!match) {
		return undefined
	}
	chapter = chapter ?? Number(match[1] ?? match[6] ?? 1)
	const verse_start = Number(match[2] ?? match[4] ?? 1)
	const verse_end = Number(match[3] ?? match[5] ?? 0) || undefined

	return { book, chapter, verse_start, verse_end }
}

// Base client functions

type ZohoFilesInfo = {
	id: string
	name: string
	type: 'writer' | 'folder'
	passage?: PassageReference
}

type ZohoListResponse = {
	data: {
		id: string
		attributes: {
			name: string
			type: 'writer' | 'folder'
		}
	}[]
}

async function list_folder_contents(folder_id: string): Promise<ZohoFilesInfo[]> {
	// refer to https://www.zoho.com/workdrive/developer/docs/api/v1/list-files-folders-inside-a-folder.html
	const params = new URLSearchParams({ 'fields[files]': 'type,name', 'page[limit]': '100' })
	const obj = await fetch_from_zoho<ZohoListResponse>({
		client: zoho_workdrive_client,
		scope: 'WorkDrive.files.READ',
		path: `files/${folder_id}/files?${params.toString()}`,
		headers: {
			Accept: 'application/vnd.api+json',
		},
	})
	if (!obj) {
		return []
	}

	return obj.data.map<ZohoFilesInfo>(x => ({ id: x.id, name: x.attributes.name, type: x.attributes.type }))
}

async function download_file(file_id: string): Promise<string | null> {
	// refer to https://www.zoho.com/writer/help/api/v1/download-document.html
	// Unintuitively, 'include_changes: all' only returns the final version of the text
	// whereas 'include_changes: none' only returns the first version of the text.
	// Also unintuitively, 'include_changes: all' does not work for 'format: txt', which only ever 
	// returns the text with the changes smushed together, making parts of it duplicated or unreadable.
	// So we have to instead download it as a docx with the right 'include_changes' setting, then use 
	// a docx parser (mammoth) to get the plain text version.
	const params = new URLSearchParams({
		'format': 'docx',
		'options': JSON.stringify({ 'include_changes': 'all' }),
	})
	const buffer = await fetch_from_zoho<ArrayBuffer>({
		client: zoho_writer_client,
		scope: 'ZohoWriter.documentEditor.ALL,ZohoPC.files.ALL,WorkDrive.files.ALL,WorkDrive.organization.ALL,WorkDrive.workspace.ALL',
		path: `download/${file_id}?${params.toString()}`,
	})
	if (!buffer) {
		return null
	}

	// refer to https://www.npmjs.com/package/mammoth
	const result = await extractRawText({ buffer: Buffer.from(buffer) })
	return result.value
}

type ZohoFetchConfig = {
	scope: string
	client: HttpClient
	path: string
	headers?: Record<string, string>
}

async function fetch_from_zoho<T>({ scope, client, path, headers }: ZohoFetchConfig): Promise<T | null> {
	const token = await get_access_token(scope)

	// refer to https://www.zoho.com/workdrive/developer/docs/api/v1/oauth-authentication-overview.html
	// TODO error id 'F7008' means request rate limit exceeded. delay 2 seconds then try again
	return await client.get<T>(path, {
		headers: {
			Authorization: `Zoho-oauthtoken ${token}`,
			...headers,
		},
	})
}

// Authorization and Access tokens

const zoho_auth_client = create_http_client({ base_url: 'https://accounts.zoho.com/oauth/v2' })

type ZohoAuthResponse = {
	access_token: string
	expires_in: number
}

async function get_access_token(scope: string): Promise<string> {
	// refer to https://www.zoho.com/developer/oauth/self-client/authorization-code-flow.html
	const cached_token = get_token_from_cache(scope)
	if (cached_token) {
		return cached_token
	}

	const params = new URLSearchParams({
		client_id: ZOHO_CLIENT_ID,
		client_secret: ZOHO_CLIENT_SECRET,
		grant_type: 'client_credentials',
		scope,
	})

	const response = await zoho_auth_client.post<ZohoAuthResponse>(`token?${params.toString()}`)
	if (!response) {
		throw Error('Could not get access token from Zoho...')
	}

	return set_token_in_cache({ ...response, scope })
}

type AccessTokenCache = {
	token: string
	expiry: Date
}
const access_token_cache = new Map<string, AccessTokenCache>()

function get_token_from_cache(scope: string): string | null {
	const cached_token = access_token_cache.get(scope)
	if (cached_token && cached_token.expiry > new Date()) {
		return cached_token.token
	}
	return null
}

function set_token_in_cache({ scope, access_token, expires_in }: { scope: string, access_token: string, expires_in: number }): string {
	const expiry = new Date()
	expiry.setSeconds(expiry.getSeconds() + expires_in - 60)
	access_token_cache.set(scope, { token: access_token, expiry })
	return access_token
}
