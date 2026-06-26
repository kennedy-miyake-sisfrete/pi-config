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
import { registerWebAgent } from "./agent";

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

			// Lines always start with header — success OR failure
			const lines: string[] = [];

			if (output.results.length === 0) {
				// ── Failure: same structure as success, explains why ─────
				lines.push(`## 🔍 Results for "${query}" (failed)`);
				lines.push("");
				lines.push(output.error ?? "No results returned.");
				lines.push("");
				lines.push("Suggestions:");
				lines.push("- Try a different query with more specific terms");
				lines.push("- DuckDuckGo may be blocking repeated requests — wait before retrying");
				lines.push("- Check your internet connection");

				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
					// Note: isError intentionally omitted — error is communicated
					// via content in the same format as success.
					details: { query: output.query, source: output.source, results: [], error: output.error },
				};
			}

			// ── Success ───────────────────────────────────────────────
			lines.push(`## 🔍 Results for "${query}" (${output.source})`);
			lines.push("");

			if (output.error) {
				// Fallback: html worked but lite failed — user should know
				lines.push(`> Note: ${output.error}`);
				lines.push("");
			}

			for (const [i, r] of output.results.entries()) {
				lines.push(`${i + 1}. **${r.title}**`);
				lines.push(`   URL: ${r.url}`);
				lines.push(`   ${r.snippet}`);
			}

			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: {
					query: output.query,
					source: output.source,
					results: output.results,
					error: output.error,
				},
			};
		},
	});

	// ── Tool: web_agent (research orchestrator) ───────────────────────
	registerWebAgent(pi);

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
							text:
								`## 🔍 web_fetch — no URLs provided\n\n` +
								`Pass at least one URL in the \`urls\` parameter.`,
						},
					],
					details: {},
				};
			}

			let output;
			try {
				output = await fetchPages(urls, signal ?? undefined);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text:
								`## 🔍 web_fetch — failed\n\n` +
								`Could not start fetch operation.\n` +
								`Error: ${msg}`,
						},
					],
					details: { error: msg },
				};
			}

			// Build human-readable summary — same format whether success or failure
			const lines: string[] = [];

			if (output.succeeded === 0 && output.failed > 0) {
				lines.push(`## 🔍 web_fetch — all ${output.total} URLs failed`);
				lines.push("");
				lines.push("Every URL returned an error. This may indicate:");
				lines.push("- Network connectivity issues");
				lines.push("- The target sites are blocking automated requests");
				lines.push("- Invalid or expired URLs");
				lines.push("");
			} else {
				lines.push(`Fetched ${output.total} URLs → ${output.outputDir}`);
			}
			lines.push("");

			for (const r of output.results) {
				if (r.file && r.size !== undefined) {
					const sizeKB = (r.size / 1024).toFixed(1);
					lines.push(`  ✅ ${r.file} (${sizeKB} KB)`);
					lines.push(`     ${r.url}`);
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

			if (output.succeeded > 0) {
				lines.push(
					`Use \`read\` to inspect the saved files under ${output.outputDir}/`,
				);
			}

			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
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
