// @ts-check
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Every app's local Cloudflare state (D1, R2, caches) lives in one folder at the repo root, not one
// per app. A database is a file named after its database_id, so a database two apps bind (DB_Auth)
// is one database locally, as it is in production, and every other database stays its own file.

/** `wrangler --persist-to`'s form: the folder that holds `v3/`. */
export const LOCAL_STATE_DIR = fileURLToPath(new URL('../../.wrangler/state', import.meta.url))

/** `getPlatformProxy()`'s `persist.path` form: the `v3/` folder itself. */
export const LOCAL_PERSIST_PATH = join(LOCAL_STATE_DIR, 'v3')

/** Where Miniflare keeps each D1 database's SQLite file. */
export const LOCAL_D1_STATE_DIR = join(LOCAL_PERSIST_PATH, 'd1', 'miniflare-D1DatabaseObject')
