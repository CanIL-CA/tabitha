export const AUTO_RETRY_LIMIT = 3
// Long enough for a brief provider slowdown or rate limit to clear, short enough that a user
// watching the batch isn't left waiting on a verse that would succeed right away.
export const AUTO_RETRY_DELAY_SECONDS = 30

export type AutoRetryStatus =
	| { phase: 'waiting', retry: number, seconds_left: number }
	| { phase: 'retrying', retry: number }
	| { phase: 'gave_up' }

type AutoRetryOptions = {
	// Resolves true once the retry succeeded.
	attempt: () => Promise<boolean>
	// null once the verse no longer needs retrying, either because a retry succeeded or because
	// something else (a manual Retry) fixed it.
	on_status: (status: AutoRetryStatus | null) => void
	// True once the result is stale (a new batch started) or already fixed.
	should_stop: () => boolean
	wait_one_second?: () => Promise<void>
}

export async function auto_retry({ attempt, on_status, should_stop, wait_one_second = default_wait_one_second }: AutoRetryOptions): Promise<void> {
	for (let retry = 1; retry <= AUTO_RETRY_LIMIT; retry++) {
		for (let seconds_left = AUTO_RETRY_DELAY_SECONDS; seconds_left > 0; seconds_left--) {
			on_status({ phase: 'waiting', retry, seconds_left })
			await wait_one_second()
			if (should_stop()) return on_status(null)
		}

		on_status({ phase: 'retrying', retry })
		if (await attempt()) return on_status(null)
		if (should_stop()) return on_status(null)
	}

	on_status({ phase: 'gave_up' })
}

function default_wait_one_second(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 1000))
}
