/**
 * Web Search Extension — Search Orchestrator
 *
 * Cascade: SearXNG (local) → Tavily → Exa → Serper.dev
 * SearXNG tried first because it's local, free, no rate limits.
 * If all fail, returns clear error with setup instructions.
 */

import type { SearchResult, EngineResult } from "./engines";
import { searchSearxng, searchTavily, searchExa, searchSerper } from "./engines";

export type SearchSource = "searxng" | "tavily" | "exa" | "serper";

export interface SearchOutput {
	query: string;
	source: SearchSource;
	results: SearchResult[];
	error?: string;
}

export { SearchResult };
export type { EngineResult };

/**
 * Search via engine cascade: SearXNG → Tavily → Exa → Serper.dev.
 */
export async function search(
	query: string,
	signal?: AbortSignal,
): Promise<SearchOutput> {
	// 0. SearXNG (local, self-hosted)
	const searxng = await searchSearxng(query, signal);
	if (searxng.results.length > 0) {
		return { query, source: "searxng", results: searxng.results };
	}

	// 1. Tavily
	const tavily = await searchTavily(query, signal);
	if (tavily.results.length > 0) {
		return {
			query,
			source: "tavily",
			results: tavily.results,
			error: searxng.error ? `SearXNG failed: ${searxng.error}` : undefined,
		};
	}

	// 2. Exa
	const exa = await searchExa(query, signal);
	if (exa.results.length > 0) {
		return {
			query,
			source: "exa",
			results: exa.results,
			error: [searxng.error ? `SearXNG: ${searxng.error}` : null, tavily.error ? `Tavily: ${tavily.error}` : null].filter(Boolean).join(" | "),
		};
	}

	// 3. Serper.dev
	const serper = await searchSerper(query, signal);
	if (serper.results.length > 0) {
		return {
			query,
			source: "serper",
			results: serper.results,
			error: [
				searxng.error ? `SearXNG: ${searxng.error}` : null,
				tavily.error ? `Tavily: ${tavily.error}` : null,
				exa.error ? `Exa: ${exa.error}` : null,
			].filter(Boolean).join(" | "),
		};
	}

	// All failed
	const errors = [searxng.error, tavily.error, exa.error, serper.error]
		.filter((e): e is string => !!e);
	return {
		query,
		source: "serper",
		results: [],
		error: errors.length > 0
			? `All engines failed: ${errors.join(" | ")}`
			: "No search providers available. Configure at least one engine.\n" +
				"  • SearXNG (local): start via 'docker compose up -d' in project root\n" +
				"  • Cloud APIs: /web_search config <serper|exa|tavily> <key>",
	};
}
