import { register_service_worker } from '@tabitha/service-worker'
import { version } from '$app/env'
import { assets, immutable } from '$app/manifest'
import { self } from '$app/service-worker'

register_service_worker({
	self,
	version,
	precache_files: [...immutable, ...assets],
	// Public linguistic examples only. Signed-in /protected/* routes and the /auth/* sign-in flow serve
	// per-user data, so never list them here: anything not listed is never cached.
	network_first_paths: ['/examples'],
})
