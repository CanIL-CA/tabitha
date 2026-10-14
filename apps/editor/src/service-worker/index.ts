import { register_service_worker } from '@tabitha/service-worker'
import { version } from '$app/env'
import { assets, immutable } from '$app/manifest'
import { self } from '$app/service-worker'

register_service_worker({
	self,
	version,
	precache_files: [...immutable, ...assets],
	// /check is editor's own GET API route (grammar/rule checking), called from the root page.
	network_first_paths: ['/check'],
})
