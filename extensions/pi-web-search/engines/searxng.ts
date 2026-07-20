/**
 * Web Search Extension — SearXNG Engine
 *
 * Self-hosted SearXNG instance (Docker). No rate limits, no API costs.
 * Default: http://localhost:4000
 * Auth: X-API-Key header (if SEARXNG_KEY is configured)
 *
 * Tries GET first. If 403 (method: POST in settings), falls back to POST.
 * Parses JSON when available; falls back to HTML scraping otherwise.
 */

import type { SearchResult, EngineResult } from "./types";
import { getSearxngKey, getSearxngUrl } from "../config";

const DEFAULT_SEARXNG_URL = "http://localhost:4000";
const TIMEOUT_MS = 10_000;

interface SearxngResult {
	title?: string;
	url?: string;
	content?: string;
}

interface SearxngResponse {
	results?: SearxngResult[];
}

async function fetchSearxng(
	url: string,
	options: RequestInit,
	signal?: AbortSignal,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(new Error("TIMEOUT")),
		TIMEOUT_MS,
	);
	if (signal) {
		signal.addEventListener("abort", () => controller.abort(signal.reason), {
			once: true,
		});
	}

	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timer);
		if (signal) signal.removeEventListener("abort", () => controller.abort());
	}
}

/**
 * Try to parse a Response as JSON. If content-type is JSON or parsing
 * succeeds, returns the parsed data. Otherwise returns null.
 */
async function tryParseJson(
	response: Response,
): Promise<SearxngResponse | null> {
	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("json")) {
		return response.json() as Promise<SearxngResponse>;
	}
	// No JSON content-type — attempt parse anyway, might work
	try {
		return (await response.clone().json()) as SearxngResponse;
	} catch {
		return null;
	}
}

export async function searchSearxng(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	const baseUrl = (getSearxngUrl() || DEFAULT_SEARXNG_URL).replace(/\/+$/, "");
	const key = getSearxngKey();

	const headers: Record<string, string> = {
		Accept: "application/json",
	};
	if (key) headers["X-API-Key"] = key;

	const encoded = encodeURIComponent(query);

	try {
		// Try GET first
		let response = await fetchSearxng(
			`${baseUrl}/search?q=${encoded}&format=json`,
			{ headers, method: "GET" },
			signal,
		);

		// If GET returns 403, SearXNG likely configured with method: POST
		if (response.status === 403) {
			response = await fetchSearxng(
				`${baseUrl}/search?format=json`,
				{
					headers: {
						...headers,
						"Content-Type": "application/x-www-form-urlencoded",
					},
					method: "POST",
					body: `q=${encoded}`,
				},
				signal,
			);
		}

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			return {
				results: [],
				error: `SearXNG: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
			};
		}

		// Try JSON
		const json = await tryParseJson(response);
		if (json !== null) {
			// Valid JSON response from SearXNG API
			if (!json.results || !Array.isArray(json.results) || json.results.length === 0) {
				return { results: [], error: "SearXNG: no results found" };
			}
			const results: SearchResult[] = json.results
				.filter((r): r is SearxngResult & { url: string } => !!r.url)
				.map((r) => ({
					title: r.title ?? r.url,
					url: r.url,
					snippet: "",
				}));
			if (results.length === 0) {
				return { results: [], error: "SearXNG: no results found" };
			}
			return { results };
		}

		// Fall back to HTML scraping
		const html = response.ok ? await response.text() : "";
		const extracted = extractResultsFromHtml(html);
		if (extracted.length > 0) {
			return { results: extracted };
		}

		return {
			results: [],
			error:
				"SearXNG: no JSON results and HTML scraping returned nothing. " +
				"Ensure 'json' is in search.formats in settings.yml and restart.",
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { results: [], error: `SearXNG: ${msg}` };
	}
}

/**
 * Fallback HTML parser — extracts search result links from SearXNG HTML page.
 * Used when JSON format is not enabled.
 */
function extractResultsFromHtml(html: string): SearchResult[] {
	const results: SearchResult[] = [];

	// Modern SearXNG: <article class="result ...">
	const articleRegex =
		/<article[^>]*class="result[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
	let match: RegExpExecArray | null;

	while ((match = articleRegex.exec(html)) !== null) {
		const article = match[1];
		const urlMatch = article.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
		const url = urlMatch ? urlMatch[1] : null;
		if (!url) continue;
		const titleMatch = article.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
		const title = titleMatch
			? titleMatch[1].replace(/<[^>]+>/g, "").trim()
			: url;
		results.push({ title: title || url, url, snippet: "" });
	}

	// Older SearXNG: <div class="result ...">
	if (results.length === 0) {
		const divRegex =
			/<div[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
		while ((match = divRegex.exec(html)) !== null) {
			const div = match[1];
			const urlMatch = div.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
			const url = urlMatch ? urlMatch[1] : null;
			if (!url) continue;
			const titleMatch = div.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
			const title = titleMatch
				? titleMatch[1].replace(/<[^>]+>/g, "").trim()
				: url;
			results.push({ title: title || url, url, snippet: "" });
		}
	}

	return results;
}
