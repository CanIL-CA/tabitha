// No network-first route: the Explorer loads its data server-side, so it never fetches its own API.
import { register_service_worker } from '@tabitha/service-worker'
import { version } from '$app/env'
import { assets, immutable } from '$app/manifest'
import { self } from '$app/service-worker'

register_service_worker({
	self,
	version,
	precache_files: [...immutable, ...assets],
})
