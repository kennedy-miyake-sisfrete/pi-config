/**
 * Web Search Extension — DuckDuckGo Search
 *
 * Searches DuckDuckGo via POST and parses HTML results with cheerio.
 * Primary: lite.duckduckgo.com/lite/  —  simpler HTML (tables)
 * Fallback: html.duckduckgo.com/html   —  richer HTML (CSS classes)
 */

import * as cheerio from "cheerio";
import { randomUserAgent, SEARCH_TIMEOUT_MS } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface SearchOutput {
	query: string;
	source: "lite" | "html";
	results: SearchResult[];
	/** Human-readable error message when all endpoints failed */
	error?: string;
}

/** Internal result from a single endpoint attempt */
interface EndpointResult {
	results: SearchResult[];
	error?: string;
}

// ---------------------------------------------------------------------------
// HTTP helper — POST form-urlencoded
// ---------------------------------------------------------------------------
async function postForm(
	url: string,
	body: URLSearchParams,
	signal?: AbortSignal,
): Promise<Response> {
	const controller = new AbortController();

	// Link the external signal so Esc works
	if (signal) {
		signal.addEventListener(
			"abort",
			() => controller.abort(signal.reason),
			{ once: true },
		);
	}

	// Timeout timer
	const timer = setTimeout(() => controller.abort(new Error("TIMEOUT")), SEARCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"User-Agent": randomUserAgent(),
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
			},
			body: body.toString(),
			signal: controller.signal,
			// Use default redirect=follow — if DDG sends us to a captcha or error page,
			// the HTML won't parse as results and we'll gracefully return null.
		});

		return response;
	} finally {
		clearTimeout(timer);
		if (signal) {
			signal.removeEventListener("abort", () => controller.abort(signal.reason));
		}
	}
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/**
 * Parse DuckDuckGo Lite HTML (table-based).
 *
 * Structure:
 *   <table> / <tr class="result">
 *     <td class="result-snippet">
 *       <a rel="nofollow" href="URL">TITLE</a>
 *     </td>
 *   </tr>
 *   <tr>
 *     <td class="snippet">SNIPPET</td>
 *   </tr>
 *   ...
 */
/** @visibleForTesting */
export function parseLiteHtml(html: string): SearchResult[] {
	const $ = cheerio.load(html);
	const results: SearchResult[] = [];

	// Approach: find all <a rel="nofollow"> inside the content table
	$('a[rel="nofollow"]').each((_i, el) => {
		const $el = $(el);
		const url = $el.attr("href")?.trim();
		const title = $el.text().trim();

		if (!url || !title) return;
		if (url.startsWith("/")) return; // internal DDG link

		// On DuckDuckGo Lite, each result spans two <tr>s:
		//   <tr class="result">   → link inside <td class="result-snippet">
		//   <tr>                  → snippet inside <td class="snippet">
		// We grab the next <tr> and look for .snippet
		const $resultRow = $el.closest("tr");
		const $snippetCell = $resultRow.next("tr").find("td.snippet");
		const snippet = $snippetCell.first().text().trim();

		results.push({ title, url, snippet });
	});

	return results;
}

/**
 * Parse DuckDuckGo HTML endpoint (div-based).
 *
 * Structure:
 *   <div class="result">
 *     <h2 class="result__title">
 *       <a class="result__a" href="URL">TITLE</a>
 *     </h2>
 *     <span class="result__snippet">SNIPPET</span>
 *   </div>
 */
/** @visibleForTesting */
export function parseHtmlEndpoint(html: string): SearchResult[] {
	const $ = cheerio.load(html);
	const results: SearchResult[] = [];

	$(".result").each((_i, el) => {
		const $el = $(el);
		const $link = $el.find(".result__a").first();
		const url = $link.attr("href")?.trim();
		const title = $link.text().trim();

		if (!url || !title) return;
		if (url.startsWith("/")) return;

		const snippet = $el.find(".result__snippet").first().text().trim();

		results.push({ title, url, snippet });
	});

	return results;
}

// ---------------------------------------------------------------------------
// Endpoint functions
// ---------------------------------------------------------------------------

/**
 * Search via DuckDuckGo Lite.
 */
async function searchLite(query: string, signal?: AbortSignal): Promise<EndpointResult> {
	try {
		const body = new URLSearchParams({ q: query });
		const response = await postForm("https://lite.duckduckgo.com/lite/", body, signal);

		if (!response.ok) {
			return { results: [], error: `HTTP ${response.status}` };
		}

		const html = await response.text();
		const results = parseLiteHtml(html);

		if (results.length === 0) {
			return { results: [], error: "no results found" };
		}

		return { results };
	} catch (err) {
		return { results: [], error: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Search via DuckDuckGo HTML endpoint.
 *
 * Note: the `b=` parameter is sent empty (DDG expects it).
 */
async function searchHtml(query: string, signal?: AbortSignal): Promise<EndpointResult> {
	try {
		const body = new URLSearchParams({ q: query, b: "" });
		const response = await postForm("https://html.duckduckgo.com/html", body, signal);

		if (!response.ok) {
			return { results: [], error: `HTTP ${response.status}` };
		}

		const html = await response.text();
		const results = parseHtmlEndpoint(html);

		if (results.length === 0) {
			return { results: [], error: "no results found" };
		}

		return { results };
	} catch (err) {
		return { results: [], error: err instanceof Error ? err.message : String(err) };
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search DuckDuckGo for the given query.
 *
 * Strategy: try lite first, fall back to html if lite fails.
 * Returns up to 10 results.
 */
export async function search(
	query: string,
	signal?: AbortSignal,
): Promise<SearchOutput> {
	// 1. Try lite endpoint
	const lite = await searchLite(query, signal);

	if (lite.results.length > 0) {
		return { query, source: "lite", results: lite.results };
	}

	// 2. Fallback to html endpoint
	const html = await searchHtml(query, signal);

	if (html.results.length > 0) {
		return {
			query,
			source: "html",
			results: html.results,
			error: `lite endpoint failed: ${lite.error}`,
		};
	}

	// 3. Both failed
	return {
		query,
		source: "html",
		results: [],
		error: `DuckDuckGo unreachable. lite: ${lite.error ?? "unknown"} | html: ${html.error ?? "unknown"}`,
	};
}
