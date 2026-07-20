/**
 * Web Search Extension — Serper.dev Engine
 *
 * API: https://google.serper.dev/search
 * Docs: https://serper.dev
 * Free tier: 2,500 queries/month, no credit card.
 */

import type { SearchResult, EngineResult } from "./types";
import { getSerperKey } from "../config";

const API_URL = "https://google.serper.dev/search";
const TIMEOUT_MS = 10_000;

interface SerperResponse {
	organic?: Array<{
		title: string;
		link: string;
		snippet: string;
		position?: number;
	}>;
	error?: string;
}

export async function searchSerper(
	query: string,
	signal?: AbortSignal,
): Promise<EngineResult> {
	const key = getSerperKey();
	if (!key) {
		return { results: [], error: "Serper.dev: API key not configured. Set via /web_search config serper <key> or SERPER_API_KEY env var." };
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error("TIMEOUT")), TIMEOUT_MS);
		if (signal) signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });

		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"X-API-Key": key,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ q: query, num: 10 }),
			signal: controller.signal,
		});

		clearTimeout(timer);
		if (signal) signal.removeEventListener("abort", () => controller.abort());

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			return { results: [], error: `Serper.dev: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}` };
		}

		const data = (await response.json()) as SerperResponse;

		if (data.error) {
			return { results: [], error: `Serper.dev: ${data.error}` };
		}

		if (!data.organic?.length) {
			return { results: [], error: "Serper.dev: no results found" };
		}

		const results: SearchResult[] = data.organic.map((r) => ({
			title: r.title,
			url: r.link,
			snippet: "",
		}));

		return { results };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { results: [], error: `Serper.dev: ${msg}` };
	}
}
