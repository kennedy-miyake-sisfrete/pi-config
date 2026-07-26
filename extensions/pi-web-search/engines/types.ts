/**
 * Web Search Extension — Shared Engine Types
 */

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface EngineResult {
	results: SearchResult[];
	error?: string;
}

/**
 * Create an AbortController wired to an external signal and a timeout.
 *
 * Uses a named handler so removeEventListener works correctly (unlike
 * arrow-function literals which create a new reference each time).
 *
 * Returns `cleanup()` which clears the timer and detaches the listener.
 */
export function createAbortController(
	signal: AbortSignal | undefined,
	timeoutMs: number,
): { controller: AbortController; cleanup: () => void } {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(new Error("TIMEOUT")),
		timeoutMs,
	);
	const abortHandler = () => controller.abort(signal?.reason);
	if (signal) {
		signal.addEventListener("abort", abortHandler, { once: true });
	}
	return {
		controller,
		cleanup: () => {
			clearTimeout(timer);
			if (signal) signal.removeEventListener("abort", abortHandler);
		},
	};
}
