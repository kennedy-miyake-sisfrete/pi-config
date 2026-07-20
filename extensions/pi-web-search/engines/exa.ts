/**
 * Web Search Extension — Exa Engine
 *
 * API: https://api.exa.ai/search
 * Docs: https://exa.ai
 * Free tier: 1,000 queries/month (requires credit card).
 */

import type { SearchResult, EngineResult } from "./types";
import { getExaKey } from "../config";

const API_URL = "https://api.exa.ai/search";
const TIMEOUT_MS = 15_000;

interface ExaResult {
	title?: string;
	url?: string;
	text?: string;
	publishedDate?: string;
}

interface ExaResponse {
	results?: ExaResult[];
	error?: string;
}

export async function searchExa(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	const key = getExaKey();
	if (!key) {
		return { results: [], error: "Exa: API key not configured. Set via /web_search config exa <key> or EXA_API_KEY env var." };
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error("TIMEOUT")), TIMEOUT_MS);
		if (signal) signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });

		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"x-api-key": key,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				numResults: 10,
				type: "auto",
			}),
			signal: controller.signal,
		});

		clearTimeout(timer);
		if (signal) signal.removeEventListener("abort", () => controller.abort());

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			return { results: [], error: `Exa: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}` };
		}

		const data = (await response.json()) as ExaResponse;

		if (data.error) {
			return { results: [], error: `Exa: ${data.error}` };
		}

		if (!data.results?.length) {
			return { results: [], error: "Exa: no results found" };
		}

		const results: SearchResult[] = data.results
			.filter((r): r is ExaResult & { url: string } => !!r.url)
			.map((r) => ({
				title: r.title ?? r.url,
				url: r.url,
				snippet: "",
			}));

		return { results };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { results: [], error: `Exa: ${msg}` };
	}
}
