import { register_service_worker } from '@tabitha/service-worker'
import { version } from '$app/env'
import { assets, immutable } from '$app/manifest'
import { self } from '$app/service-worker'

register_service_worker({
	self,
	version,
	precache_files: [...immutable, ...assets],
	// /analyze is sources' own GET API route (semantic analysis of Phase 1 text), called from the edit page.
	network_first_paths: ['/analyze'],
})
