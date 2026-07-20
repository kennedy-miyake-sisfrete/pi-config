/**
 * Web Search Extension — Tavily Engine
 *
 * API: https://api.tavily.com/search
 * Docs: https://tavily.com
 * Free tier: 1,000 queries/month (requires credit card).
 */

import type { SearchResult, EngineResult } from "./types";
import { getTavilyKey } from "../config";

const API_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 15_000;

interface TavilyResult {
	title?: string;
	url?: string;
	content?: string;
	raw_content?: string | null;
}

interface TavilyResponse {
	results?: TavilyResult[];
	error?: string;
}

export async function searchTavily(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	const key = getTavilyKey();
	if (!key) {
		return { results: [], error: "Tavily: API key not configured. Set via /web_search config tavily <key> or TAVILY_API_KEY env var." };
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error("TIMEOUT")), TIMEOUT_MS);
		if (signal) signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });

		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				max_results: 10,
				search_depth: "basic",
				include_answer: false,
				include_raw_content: false,
			}),
			signal: controller.signal,
		});

		clearTimeout(timer);
		if (signal) signal.removeEventListener("abort", () => controller.abort());

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			return { results: [], error: `Tavily: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}` };
		}

		const data = (await response.json()) as TavilyResponse;

		if (data.error) {
			return { results: [], error: `Tavily: ${data.error}` };
		}

		if (!data.results?.length) {
			return { results: [], error: "Tavily: no results found" };
		}

		const results: SearchResult[] = data.results
			.filter((r): r is TavilyResult & { url: string } => !!r.url)
			.map((r) => ({
				title: r.title ?? r.url,
				url: r.url,
				snippet: "",
			}));

		return { results };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { results: [], error: `Tavily: ${msg}` };
	}
}
