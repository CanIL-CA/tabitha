/**
 * Strips any trailing slashes from a URL or endpoint string.
 *
 * @param url Base URL or endpoint
 * @returns Clean URL without trailing slashes
 *
 * @example
 * clean_trailing_slash("http://localhost:8788/") -> "http://localhost:8788"
 * clean_trailing_slash("http://localhost:8788") -> "http://localhost:8788"
 */
export function clean_trailing_slash(url: string): string {
	// A loop rather than `/\/+$/`, which rescans every run of slashes and goes quadratic on "////...x"
	let end = url.length
	while (end > 0 && url[end - 1] === '/') end--
	return url.slice(0, end)
}
