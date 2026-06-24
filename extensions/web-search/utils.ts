/**
 * Web Search Extension — Utilities
 *
 * UA pool, random delay, filename sanitization, async concurrency pool.
 */

// ---------------------------------------------------------------------------
// User-Agent Pool — 8 realistas de navegadores modernos
// ---------------------------------------------------------------------------
export const USER_AGENTS = [
	// Chrome 125 — Windows
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	// Chrome 125 — macOS
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	// Chrome 125 — Linux
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	// Firefox 126 — Windows
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
	// Firefox 126 — macOS
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
	// Firefox 126 — Linux
	"Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
	// Safari 17.5 — macOS
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
	// Edge 125 — Windows
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
];

/** Pick a random User-Agent from the pool */
export function randomUserAgent(): string {
	return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ---------------------------------------------------------------------------
// Delay
// ---------------------------------------------------------------------------
export const MIN_DELAY_MS = 500;
export const MAX_DELAY_MS = 2000;

/** Wait between `min` and `max` milliseconds (defaults to 500-2000) */
export function randomDelay(min = MIN_DELAY_MS, max = MAX_DELAY_MS): Promise<void> {
	const ms = Math.floor(Math.random() * (max - min + 1)) + min;
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------
export const SEARCH_TIMEOUT_MS = 10_000;
export const FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------
/**
 * Convert a URL to a safe filename.
 *
 * Example:
 *   https://example.com/page?id=123  →  https_example_com_page_id_123.txt
 */
export function sanitizeFilename(url: string): string {
	let name = url
		.replace(/^https?:\/\//i, (m) => m.replace(":", "_").replace("//", "_"))
		// 1) "https://" or "http://" → "https_" / "http_"
		.replace(/[\/?=&#.:;@+$~%,|!()'*\[\]]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")
		.toLowerCase();

	// Truncate to 200 chars to avoid filesystem limits
	if (name.length > 200) {
		name = name.slice(0, 200);
	}

	return `${name}.txt`;
}

// ---------------------------------------------------------------------------
// Async concurrency pool
// ---------------------------------------------------------------------------
/**
 * Process an array of items with limited concurrency.
 *
 * Each item is processed by `fn`. At most `concurrency` promises run in
 * parallel; remaining items queue and start as slots free up.
 */
export async function asyncPool<T>(
	concurrency: number,
	items: T[],
	fn: (item: T) => Promise<void>,
): Promise<void> {
	const executing = new Set<Promise<void>>();
	let firstError: unknown = undefined;

	for (const item of items) {
		// Catch per-item errors so the loop continues processing remaining items
		const p = fn(item).catch((e) => {
			if (firstError === undefined) firstError = e;
		});
		executing.add(p);
		p.finally(() => executing.delete(p));

		if (executing.size >= concurrency) {
			await Promise.race(executing);
		}
	}

	await Promise.all(executing);

	// Re-throw the first error after all items have been processed
	if (firstError !== undefined) throw firstError;
}
