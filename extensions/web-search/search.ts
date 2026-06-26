/**
 * Web Search Extension — Search Orchestrator
 *
 * Tries each search engine in order until one returns results:
 *   1. DuckDuckGo Lite
 *   2. DuckDuckGo HTML (fallback)
 *   3. Bing RSS
 *   4. Brave Search HTML
 *
 * All engine implementations live in ./engines.
 */

import type { SearchResult, EngineResult } from "./engines";
import {
	searchDDGLite,
	searchDDGHtml,
	searchBing,
	searchBrave,
} from "./engines";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SearchOutput {
	query: string;
	source: "lite" | "html" | "bing" | "brave";
	results: SearchResult[];
	/** Human-readable error message when all endpoints failed */
	error?: string;
}

export { SearchResult };
export type { EngineResult };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search the web for the given query.
 *
 * Strategy: try each engine in order until one returns results.
 *   1. DuckDuckGo Lite
 *   2. DuckDuckGo HTML (fallback)
 *   3. Bing RSS (no API key)
 *   4. Brave Search HTML (no API key)
 */
export async function search(
	query: string,
	signal?: AbortSignal,
): Promise<SearchOutput> {
	// 1. DuckDuckGo Lite
	const lite = await searchDDGLite(query, signal);
	if (lite.results.length > 0) {
		return { query, source: "lite", results: lite.results };
	}

	// 2. DuckDuckGo HTML (fallback)
	const html = await searchDDGHtml(query, signal);
	if (html.results.length > 0) {
		return {
			query,
			source: "html",
			results: html.results,
			error: `lite endpoint failed: ${lite.error}`,
		};
	}

	// 3. Bing RSS
	const bing = await searchBing(query, signal);
	if (bing.results.length > 0) {
		return {
			query,
			source: "bing",
			results: bing.results,
			error: `DDG unreachable. lite: ${lite.error} | html: ${html.error}`,
		};
	}

	// 4. Brave Search HTML
	const brave = await searchBrave(query, signal);
	if (brave.results.length > 0) {
		return {
			query,
			source: "brave",
			results: brave.results,
			error: `DDG unreachable. lite: ${lite.error} | html: ${html.error} | bing: ${bing.error}`,
		};
	}

	// 5. All failed
	return {
		query,
		source: "brave",
		results: [],
		error:
			`All engines failed. ` +
			`DDG: ${lite.error ?? "?"}/${html.error ?? "?"} | ` +
			`Bing: ${bing.error ?? "?"} | ` +
			`Brave: ${brave.error ?? "?"}`,
	};
}
