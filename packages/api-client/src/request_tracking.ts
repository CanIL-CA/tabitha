type TrackRequest = <T>(request: Promise<T>) => Promise<T>

let tracker: TrackRequest | undefined

/** Lets the UI watch every request the clients make, e.g. to tell the user when one is slow. */
export function use_request_tracking(track: TrackRequest) {
	tracker = track
}

export function tracked<T>(request: Promise<T>): Promise<T> {
	return tracker ? tracker(request) : request
}
