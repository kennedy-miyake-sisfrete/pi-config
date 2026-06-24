/**
 * Web Search Extension — Entry Point
 *
 * Registers two tools:
 *   1. web_search  — search DuckDuckGo for URLs
 *   2. web_fetch   — fetch page content from URLs (WIP, next session)
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { search } from "./search";

export default function (pi: ExtensionAPI) {
	// ── Tool: web_search ───────────────────────────────────────────────
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web via DuckDuckGo. Returns up to 10 results (title, URL, snippet). " +
			"Use to find current information, docs, or any web content. " +
			"Call multiple times with different queries to gather diverse sources, " +
			"then pass the URLs to web_fetch for full content extraction.",

		parameters: Type.Object({
			query: Type.String({
				description: "Search query — use specific, targeted terms for better results",
			}),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const { query } = params as { query: string };

			const output = await search(query, signal ?? undefined);

			if (output.results.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								`## ❌ No results for "${query}"\n\n` +
								`DuckDuckGo returned no results. This could mean:\n` +
								`- The query is too specific — try broader terms\n` +
								`- DuckDuckGo blocked the request — try again later\n` +
								`- A network error occurred`,
						},
					],
					isError: true,
					details: { query: output.query, source: output.source, results: [] },
				};
			}

			// Build a clean text summary for the LLM
			const lines = output.results.map(
				(r, i) =>
					`${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
			);

			return {
				content: [
					{
						type: "text" as const,
						text:
							`## 🔍 Results for "${query}" (${output.source})\n\n` +
							lines.join("\n\n"),
					},
				],
				details: {
					query: output.query,
					source: output.source,
					results: output.results,
				},
			};
		},
	});

	// ── Tool: web_fetch (placeholder) ──────────────────────────────────
	// Will be implemented in the next session.
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"[NOT YET IMPLEMENTED] Fetch full page content from URLs. Will extract clean text " +
			"from each page and save to /tmp/.",

		parameters: Type.Object({
			urls: Type.Array(Type.String(), {
				description: "URLs to fetch content from",
			}),
		}),

		async execute() {
			return {
				content: [
					{
						type: "text" as const,
						text: "web_fetch is not yet implemented. Please try again later.",
					},
				],
				isError: true,
				details: {},
			};
		},
	});
}
