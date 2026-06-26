/**
 * Tests for search.ts — orchestrator cascade
 *
 * Covers: search() engine cascade with mocked fetch.
 * Engine-specific parse tests live in engines.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock randomDelay so tests run instantly (no real setTimeout)
vi.mock("../utils", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		randomDelay: vi.fn().mockResolvedValue(undefined),
		throttleSearch: vi.fn().mockResolvedValue(undefined),
	};
});

import { search } from "../search";

// ---------------------------------------------------------------------------
// Mock HTML fixtures
// ---------------------------------------------------------------------------

const LITE_HTML_3 = `<!DOCTYPE html>
<html><head><title>DuckDuckGo</title></head><body class="lite">
<form action="/lite/" method="post"><input type="text" name="q" value="test" /></form>
<div id="zero_click_wrapper"><table>
  <tr class="result"><td valign="top" class="result-snippet">
    <a rel="nofollow" href="https://example.com/page1">Result 1</a></td></tr>
  <tr><td class="snippet">Snippet one.</td></tr>
  <tr class="result"><td valign="top" class="result-snippet">
    <a rel="nofollow" href="https://example.com/page2">Result 2</a></td></tr>
  <tr><td class="snippet">Snippet two.</td></tr>
  <tr class="result"><td valign="top" class="result-snippet">
    <a rel="nofollow" href="https://example.com/page3">Result 3</a></td></tr>
  <tr><td class="snippet">Snippet three.</td></tr>
</table></div></body></html>`;

const HTML_ENDPOINT_2 = `<!DOCTYPE html>
<html><head><title>DuckDuckGo Search</title></head><body>
<div class="search__results">
  <div class="result"><h2 class="result__title">
    <a class="result__a" href="https://example.com/a">A Title</a></h2>
    <span class="result__snippet">A snippet.</span></div>
  <div class="result"><h2 class="result__title">
    <a class="result__a" href="https://example.com/b">B Title</a></h2>
    <span class="result__snippet">B snippet.</span></div>
</div></body></html>`;

const LITE_NO_RESULTS = `<!DOCTYPE html>
<html><head><title>DuckDuckGo — No results</title></head>
<body class="lite"><form action="/lite/" method="post">
<input type="text" name="q" value="zzz" /></form>
<div id="zero_click_wrapper"><p>No results found.</p></div></body></html>`;

const BLOCK_HTML = `<html><body>Please confirm that you are a human</body></html>`;

// ---------------------------------------------------------------------------
// search() — engine cascade with mocked fetch
// ---------------------------------------------------------------------------
describe("search — integration with mocked fetch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns results from lite endpoint (primary path)", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => LITE_HTML_3,
		});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("test query");

		expect(result.query).toBe("test query");
		expect(result.source).toBe("lite");
		expect(result.results).toHaveLength(3);
		expect(result.results[0].title).toBe("Result 1");

		// Should only have called lite endpoint
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const calledUrl = mockFetch.mock.calls[0][0];
		expect(calledUrl).toContain("lite.duckduckgo.com");

		vi.unstubAllGlobals();
	});

	it("falls back to html endpoint when lite fails", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 403 })
			.mockResolvedValueOnce({
				ok: true,
				text: async () => HTML_ENDPOINT_2,
			});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("fallback query");

		expect(result.source).toBe("html");
		expect(result.results).toHaveLength(2);
		expect(mockFetch).toHaveBeenCalledTimes(2);

		vi.unstubAllGlobals();
	});

	it("falls back to html endpoint when lite returns empty", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				text: async () => LITE_NO_RESULTS,
			})
			.mockResolvedValueOnce({
				ok: true,
				text: async () => HTML_ENDPOINT_2,
			});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("query with fallback");

		expect(result.source).toBe("html");
		expect(result.results).toHaveLength(2);

		vi.unstubAllGlobals();
	});

	it("returns empty results when all 4 endpoints fail", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("failing query");

		expect(result.results).toEqual([]);
		expect(result.source).toBe("brave"); // last engine in cascade
		expect(mockFetch).toHaveBeenCalledTimes(4); // lite + html + bing + brave

		vi.unstubAllGlobals();
	});

	it("falls through all 4 engines when lite returns block page", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => BLOCK_HTML,
		});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("query");

		expect(result.results).toEqual([]);
		expect(result.error).toContain("BLOCKED");
		expect(mockFetch).toHaveBeenCalledTimes(4);

		vi.unstubAllGlobals();
	});

	it("falls back to html when lite returns block page", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				text: async () => BLOCK_HTML,
			})
			.mockResolvedValueOnce({
				ok: true,
				text: async () => HTML_ENDPOINT_2,
			});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("query");

		expect(result.source).toBe("html");
		expect(result.results).toHaveLength(2);
		expect(mockFetch).toHaveBeenCalledTimes(2);

		vi.unstubAllGlobals();
	});

	it("sends correct POST body to lite endpoint", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => LITE_HTML_3,
		});
		vi.stubGlobal("fetch", mockFetch);

		await search("node.js testing");

		const callArgs = mockFetch.mock.calls[0];
		expect(callArgs[0]).toBe("https://lite.duckduckgo.com/lite/");
		expect(callArgs[1].method).toBe("POST");
		expect(callArgs[1].body).toBe("q=node.js+testing");
		expect(callArgs[1].headers["Content-Type"]).toBe(
			"application/x-www-form-urlencoded",
		);
		expect(callArgs[1].headers["User-Agent"]).toBeTruthy();

		vi.unstubAllGlobals();
	});

	it("sends correct POST body to html endpoint on fallback", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 403 })
			.mockResolvedValueOnce({
				ok: true,
				text: async () => HTML_ENDPOINT_2,
			});
		vi.stubGlobal("fetch", mockFetch);

		await search("fallback test");

		const callArgs = mockFetch.mock.calls[1];
		expect(callArgs[0]).toBe("https://html.duckduckgo.com/html");
		expect(callArgs[1].method).toBe("POST");
		expect(callArgs[1].body).toContain("q=fallback+test");
		expect(callArgs[1].body).toContain("b=");

		vi.unstubAllGlobals();
	});
});
