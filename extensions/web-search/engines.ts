/**
 * Web Search Extension — Additional Search Engines
 *
 * Fallback engines for when DuckDuckGo is blocked.
 *   - Bing: uses RSS endpoint (clean XML, no API key needed)
 *   - Brave Search: HTML scraping with structural selectors
 */

import * as cheerio from "cheerio";
import { randomUserAgent, randomDelay, throttleSearch, SEARCH_TIMEOUT_MS } from "./utils";

// ---------------------------------------------------------------------------
// Types (re-exported from search.ts for consistency)
// ---------------------------------------------------------------------------
export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface EngineResult {
	results: SearchResult[];
	error?: string;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** POST form-urlencoded — used by DuckDuckGo */
async function postForm(
	url: string,
	body: URLSearchParams,
	signal?: AbortSignal,
): Promise<Response> {
	const controller = new AbortController();

	const abortHandler = () => controller.abort(signal?.reason);
	if (signal) {
		signal.addEventListener("abort", abortHandler, { once: true });
	}

	await Promise.all([randomDelay(), throttleSearch()]);

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
		});

		return response;
	} finally {
		clearTimeout(timer);
		if (signal) {
			signal.removeEventListener("abort", abortHandler);
		}
	}
}

/** GET with common headers + timeout */
async function get(url: string, signal?: AbortSignal): Promise<Response> {
	const controller = new AbortController();

	const abortHandler = () => controller.abort(signal?.reason);
	if (signal) {
		signal.addEventListener("abort", abortHandler, { once: true });
	}

	const timer = setTimeout(() => controller.abort(new Error("TIMEOUT")), SEARCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": randomUserAgent(),
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
			},
		});
		return response;
	} finally {
		clearTimeout(timer);
		if (signal) {
			signal.removeEventListener("abort", abortHandler);
		}
	}
}

// ---------------------------------------------------------------------------
// Bing — RSS endpoint
// ---------------------------------------------------------------------------

/**
 * Parse Bing RSS XML feed into SearchResult items.
 *
 * Structure:
 *   <rss><channel>
 *     <item>
 *       <title>Page Title</title>
 *       <link>https://...</link>
 *       <description>Snippet text</description>
 *     </item>
 *   </channel></rss>
 */
/** @visibleForTesting */
export function parseBingRss(xml: string): SearchResult[] {
	const $ = cheerio.load(xml, { xmlMode: true });
	const results: SearchResult[] = [];

	$("item").each((_i, el) => {
		const $el = $(el);
		const title = $el.find("title").first().text().trim();
		const url = $el.find("link").first().text().trim();
		const snippet = $el.find("description").first().text().trim();

		if (!title || !url) return;
		results.push({ title, url, snippet });
	});

	return results;
}

/**
 * Search Bing via RSS feed.
 *
 * Bing offers results in RSS XML format via ?format=rss.
 * No API key needed — respects the RSS terms of use.
 */
export async function searchBing(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	try {
		const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
		const response = await get(url, signal);

		if (!response.ok) {
			return { results: [], error: `Bing HTTP ${response.status}` };
		}

		const xml = await response.text();
		const results = parseBingRss(xml);

		if (results.length === 0) {
			return { results: [], error: "Bing: no results found" };
		}

		return { results };
	} catch (err) {
		return { results: [], error: `Bing: ${err instanceof Error ? err.message : String(err)}` };
	}
}

// ---------------------------------------------------------------------------
// DuckDuckGo — lite + html
// ---------------------------------------------------------------------------

const BLOCK_INDICATORS = [
	"please confirm that you are a human",
	"unusual traffic",
	"captcha",
	"please try again later",
	"automated requests",
	"blocked",
	"our systems have detected",
];

/**
 * Check if the response HTML is a captcha, block, or rate-limit page
 * rather than actual search results.
 */
/** @visibleForTesting */
export function isBlockPage(html: string): boolean {
	const lower = html.toLowerCase();
	return BLOCK_INDICATORS.some((indicator) => lower.includes(indicator));
}

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
 */
/** @visibleForTesting */
export function parseLiteHtml(html: string): SearchResult[] {
	const $ = cheerio.load(html);
	const results: SearchResult[] = [];

	$('a[rel="nofollow"]').each((_i, el) => {
		const $el = $(el);
		const url = $el.attr("href")?.trim();
		const title = $el.text().trim();

		if (!url || !title) return;
		if (url.startsWith("/")) return;

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

/**
 * Search via DuckDuckGo Lite endpoint.
 */
export async function searchDDGLite(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	try {
		const body = new URLSearchParams({ q: query });
		const response = await postForm("https://lite.duckduckgo.com/lite/", body, signal);

		if (!response.ok) {
			return { results: [], error: `HTTP ${response.status}` };
		}

		const html = await response.text();

		if (isBlockPage(html)) {
			return { results: [], error: "BLOCKED — DuckDuckGo returned a captcha or rate-limit page. Wait before retrying." };
		}

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
 * Search via DuckDuckGo HTML endpoint (fallback).
 *
 * Note: the `b=` parameter is sent empty (DDG expects it).
 */
export async function searchDDGHtml(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	try {
		const body = new URLSearchParams({ q: query, b: "" });
		const response = await postForm("https://html.duckduckgo.com/html", body, signal);

		if (!response.ok) {
			return { results: [], error: `HTTP ${response.status}` };
		}

		const html = await response.text();

		if (isBlockPage(html)) {
			return { results: [], error: "BLOCKED — DuckDuckGo returned a captcha or rate-limit page. Wait before retrying." };
		}

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
// Brave Search — HTML scraping
// ---------------------------------------------------------------------------

/**
 * Parse Brave Search HTML into SearchResult items.
 *
 * Structure uses Svelte-hashed class names, so we rely on attribute-contains
 * selectors and DOM position rather than fixed class names.
 *
 * Pattern observed:
 *   <a class="desktop-heading-h3 svelte-XXXXX" href="URL">TITLE</a>
 *   <div class="generic-snippet svelte-XXXXX">
 *     <div class="content ...">SNIPPET</div>
 *   </div>
 *   <cite class="snippet-url ...">URL</cite>
 */
/** @visibleForTesting */
export function parseBraveHtml(html: string): SearchResult[] {
	const $ = cheerio.load(html);
	const results: SearchResult[] = [];

	// Find result title links — look for <a> with heading-like classes
	// inside the snippet container (not navigation links)
	$('a[class*="desktop-heading-"]').each((_i, el) => {
		const $el = $(el);
		const href = $el.attr("href");
		const title = $el.text().trim();

		if (!href || !title) return;
		if (!href.startsWith("http")) return; // skip internal links

		// Try to find the snippet — look for generic-snippet nearby
		let snippet = "";
		const $parent = $el.closest("div");
		// Search up to 3 parent levels for generic-snippet
		const $snippetDiv = $parent.find('div[class*="generic-snippet"]').first();
		if ($snippetDiv.length) {
			snippet = $snippetDiv.text().trim();
		} else {
			// Fallback: search siblings
			const $siblingSnippet = $el
				.parentsUntil(".snippet")
				.last()
				.find('div[class*="generic-snippet"]')
				.first();
			if ($siblingSnippet.length) {
				snippet = $siblingSnippet.text().trim();
			}
		}

		results.push({ title, url: href, snippet });
	});

	return results;
}

/**
 * Search Brave Search via HTML scraping.
 *
 * Best-effort parsing — if the DOM structure changes significantly,
 * this returns 0 results and the orchestrator falls through to the
 * next engine.
 */
export async function searchBrave(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	try {
		const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
		const response = await get(url, signal);

		if (!response.ok) {
			return { results: [], error: `Brave HTTP ${response.status}` };
		}

		const html = await response.text();

		if (html.includes("captcha")) {
			return { results: [], error: "Brave: captcha blocked" };
		}

		const results = parseBraveHtml(html);

		if (results.length === 0) {
			return { results: [], error: "Brave: no results found" };
		}

		return { results };
	} catch (err) {
		return { results: [], error: `Brave: ${err instanceof Error ? err.message : String(err)}` };
	}
}
