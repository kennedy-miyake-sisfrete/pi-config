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
import { fetchPages } from "./fetch";

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

	// ── Tool: web_fetch ───────────────────────────────────────────────
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch full page content from a list of URLs. " +
			"Extracts clean text from each page (strips HTML tags, scripts, navigation) " +
			"and saves to /tmp/page_<date>_<random>/. " +
			"Processes up to 10 URLs in parallel; excess URLs are queued. " +
			"Each request uses a random User-Agent and a small random delay to avoid blocking. " +
			"Call after web_search to get the actual content of the URLs found.",

		parameters: Type.Object({
			urls: Type.Array(Type.String(), {
				description:
					"URLs to fetch — pass all collected URLs in one call. " +
					"Max 10 concurrent, rest queued automatically.",
			}),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const { urls } = params as { urls: string[] };

			if (!urls || urls.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: "## ❌ web_fetch: no URLs provided\n\nPass at least one URL in the `urls` parameter.",
						},
					],
					isError: true,
					details: {},
				};
			}

			const output = await fetchPages(urls, signal ?? undefined);

			// Build human-readable summary
			const lines: string[] = [];
			lines.push(`Fetched ${output.total} URLs → ${output.outputDir}`);
			lines.push("");

			for (const r of output.results) {
				if (r.file && r.size !== undefined) {
					const sizeKB = (r.size / 1024).toFixed(1);
					lines.push(`  ✅ ${r.url}`);
					lines.push(`     → ${r.file} (${sizeKB} KB)`);
				} else if (r.error) {
					lines.push(`  ❌ ${r.url}`);
					lines.push(`     → ${r.error}`);
				} else {
					lines.push(`  ⚠️  ${r.url} — unknown state`);
				}
			}

			lines.push("");
			lines.push(
				`Summary: ${output.succeeded} succeeded, ${output.failed} failed out of ${output.total}.`,
			);
			lines.push(
				`Use \`read\` to inspect the saved files under ${output.outputDir}/`,
			);

			return {
				content: [
					{
						type: "text" as const,
						text: lines.join("\n"),
					},
				],
				details: {
					outputDir: output.outputDir,
					total: output.total,
					succeeded: output.succeeded,
					failed: output.failed,
					results: output.results,
				},
			};
		},
	});
}
