/**
 * Tests for search.ts
 *
 * Covers: parseLiteHtml, parseHtmlEndpoint, full search() with mocked fetch
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

import { parseLiteHtml, parseHtmlEndpoint, search, isBlockPage } from "../search";

// ---------------------------------------------------------------------------
// Mock HTML fixtures — realistic DuckDuckGo responses
// ---------------------------------------------------------------------------

/** 3 results in DuckDuckGo Lite format */
const LITE_HTML_FIXTURE = `<!DOCTYPE html>
<html>
<head><title>DuckDuckGo</title></head>
<body class="lite">
<form action="/lite/" method="post">
  <input type="text" name="q" value="test query" />
</form>
<div id="zero_click_wrapper">
<table>
  <tr class="result">
    <td valign="top" class="result-snippet">
      <a rel="nofollow" href="https://example.com/page1">First Result Title</a>
    </td>
  </tr>
  <tr>
    <td class="snippet">This is the snippet for the first result. It provides useful context about the page.</td>
  </tr>
  <tr class="result">
    <td valign="top" class="result-snippet">
      <a rel="nofollow" href="https://example.org/article">Second Article Title</a>
    </td>
  </tr>
  <tr>
    <td class="snippet">A longer snippet here that describes what the second article is about in more detail.</td>
  </tr>
  <tr class="result">
    <td valign="top" class="result-snippet">
      <a rel="nofollow" href="https://docs.example.com/guide">Third Guide — Reference</a>
    </td>
  </tr>
  <tr>
    <td class="snippet">Reference snippet for the third result showing what users can expect from this guide.</td>
  </tr>
</table>
</div>
</body>
</html>`;

/** 2 results in DuckDuckGo HTML endpoint format */
const HTML_ENDPOINT_FIXTURE = `<!DOCTYPE html>
<html>
<head><title>DuckDuckGo Search</title></head>
<body>
<div class="search__results">
  <div class="result result--clickable" data-nr="1">
    <h2 class="result__title">
      <a class="result__a" href="https://example.com/page1">First Result Title</a>
    </h2>
    <span class="result__snippet">Snippet from the HTML endpoint for the first result.</span>
  </div>
  <div class="result result--clickable" data-nr="2">
    <h2 class="result__title">
      <a class="result__a" href="https://example.org/article">Second Result — HTML Version</a>
    </h2>
    <span class="result__snippet">This snippet comes from the HTML endpoint variant.</span>
  </div>
</div>
</body>
</html>`;

/** Empty results page (no results found) */
const LITE_NO_RESULTS_HTML = `<!DOCTYPE html>
<html>
<head><title>DuckDuckGo — No results</title></head>
<body class="lite">
<form action="/lite/" method="post">
  <input type="text" name="q" value="zzzzzznotfound" />
</form>
<div id="zero_click_wrapper">
<p>No results found.</p>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// isBlockPage
// ---------------------------------------------------------------------------
describe("isBlockPage", () => {
	it("returns false for normal search results", () => {
		expect(isBlockPage("<html><body><div class=\"result\">...</div></body></html>")).toBe(false);
	});

	it("returns true when page contains captcha text", () => {
		expect(isBlockPage("Please confirm that you are a human")).toBe(true);
	});

	it("returns true when page mentions unusual traffic", () => {
		expect(isBlockPage("Our systems have detected unusual traffic from your network")).toBe(true);
	});

	it("returns true when page mentions blocked", () => {
		expect(isBlockPage("This page has been blocked due to automated requests")).toBe(true);
	});

	it("returns false for empty string", () => {
		expect(isBlockPage("")).toBe(false);
	});

	it("returns false for generic HTML without block indicators", () => {
		expect(isBlockPage("<html><body><p>Nothing here</p></body></html>")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// parseLiteHtml
// ---------------------------------------------------------------------------
describe("parseLiteHtml", () => {
	it("extracts 3 results from valid Lite HTML", () => {
		const results = parseLiteHtml(LITE_HTML_FIXTURE);
		expect(results).toHaveLength(3);
	});

	it("extracts correct title, url, and snippet for each result", () => {
		const results = parseLiteHtml(LITE_HTML_FIXTURE);

		expect(results[0]).toEqual({
			title: "First Result Title",
			url: "https://example.com/page1",
			snippet: expect.stringContaining("snippet for the first result"),
		});

		expect(results[1]).toEqual({
			title: "Second Article Title",
			url: "https://example.org/article",
			snippet: expect.stringContaining("second article"),
		});

		expect(results[2]).toEqual({
			title: "Third Guide — Reference",
			url: "https://docs.example.com/guide",
			snippet: expect.stringContaining("third result"),
		});
	});

	it("returns empty array for no-results page", () => {
		const results = parseLiteHtml(LITE_NO_RESULTS_HTML);
		expect(results).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		const results = parseLiteHtml("");
		expect(results).toEqual([]);
	});

	it("returns empty array for HTML without result links", () => {
		const results = parseLiteHtml("<html><body><p>Hello</p></body></html>");
		expect(results).toEqual([]);
	});

	it("skips internal links (starting with /)", () => {
		const html = `<html><body class="lite">
      <table>
        <tr class="result"><td><a rel="nofollow" href="/help">Help Page</a></td></tr>
        <tr><td class="snippet">Internal help</td></tr>
        <tr class="result"><td><a rel="nofollow" href="https://external.com/page">External Page</a></td></tr>
        <tr><td class="snippet">External snippet</td></tr>
      </table>
    </body></html>`;

		const results = parseLiteHtml(html);
		expect(results).toHaveLength(1);
		expect(results[0].url).toBe("https://external.com/page");
	});

	it("handles malformed HTML gracefully", () => {
		const results = parseLiteHtml("<a rel=nofollow href=https://x.com>Title</a>");
		// cheerio is forgiving — it should parse this
		expect(results).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// parseHtmlEndpoint
// ---------------------------------------------------------------------------
describe("parseHtmlEndpoint", () => {
	it("extracts 2 results from valid HTML endpoint markup", () => {
		const results = parseHtmlEndpoint(HTML_ENDPOINT_FIXTURE);
		expect(results).toHaveLength(2);
	});

	it("extracts correct fields for each result", () => {
		const results = parseHtmlEndpoint(HTML_ENDPOINT_FIXTURE);

		expect(results[0]).toEqual({
			title: "First Result Title",
			url: "https://example.com/page1",
			snippet: "Snippet from the HTML endpoint for the first result.",
		});

		expect(results[1]).toEqual({
			title: "Second Result — HTML Version",
			url: "https://example.org/article",
			snippet: "This snippet comes from the HTML endpoint variant.",
		});
	});

	it("returns empty array when no .result elements exist", () => {
		const results = parseHtmlEndpoint("<html><body><p>no results</p></body></html>");
		expect(results).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		const results = parseHtmlEndpoint("");
		expect(results).toEqual([]);
	});

	it("skips results with internal links", () => {
		const html = `<html><body>
      <div class="result">
        <h2 class="result__title"><a class="result__a" href="/search">Search Page</a></h2>
        <span class="result__snippet">Internal search</span>
      </div>
      <div class="result">
        <h2 class="result__title"><a class="result__a" href="https://real.com/page">Real Page</a></h2>
        <span class="result__snippet">Real content</span>
      </div>
    </body></html>`;

		const results = parseHtmlEndpoint(html);
		expect(results).toHaveLength(1);
		expect(results[0].url).toBe("https://real.com/page");
	});

	it("handles result without snippet gracefully", () => {
		const html = `<html><body>
      <div class="result">
        <h2 class="result__title"><a class="result__a" href="https://x.com">No Snippet</a></h2>
      </div>
    </body></html>`;

		const results = parseHtmlEndpoint(html);
		expect(results).toHaveLength(1);
		expect(results[0].snippet).toBe("");
	});
});

// ---------------------------------------------------------------------------
// Full search() integration (with mocked fetch)
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
			text: async () => LITE_HTML_FIXTURE,
		});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("test query");

		expect(result.query).toBe("test query");
		expect(result.source).toBe("lite");
		expect(result.results).toHaveLength(3);
		expect(result.results[0].title).toBe("First Result Title");

		// Should only have called lite endpoint
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const calledUrl = mockFetch.mock.calls[0][0];
		expect(calledUrl).toContain("lite.duckduckgo.com");

		vi.unstubAllGlobals();
	});

	it("falls back to html endpoint when lite fails", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 403 }) // lite fails
			.mockResolvedValueOnce({
				// html succeeds
				ok: true,
				text: async () => HTML_ENDPOINT_FIXTURE,
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
				// lite returns page but no results
				ok: true,
				text: async () => LITE_NO_RESULTS_HTML,
			})
			.mockResolvedValueOnce({
				// html succeeds
				ok: true,
				text: async () => HTML_ENDPOINT_FIXTURE,
			});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("query with fallback");

		expect(result.source).toBe("html");
		expect(result.results).toHaveLength(2);

		vi.unstubAllGlobals();
	});

	it("returns empty results when both endpoints fail", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("failing query");

		expect(result.results).toEqual([]);
		expect(result.source).toBe("brave"); // last engine in cascade
		expect(mockFetch).toHaveBeenCalledTimes(4); // lite + html + bing + brave

		vi.unstubAllGlobals();
	});

	it("detects block page and returns BLOCKED error", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () =>
				"<html><body>Please confirm that you are a human</body></html>",
		});
		vi.stubGlobal("fetch", mockFetch);

		const result = await search("query");

		expect(result.results).toEqual([]);
		expect(result.error).toContain("BLOCKED");
		expect(mockFetch).toHaveBeenCalledTimes(4); // lite + html + bing + brave

		vi.unstubAllGlobals();
	});

	it("falls back to html when lite returns block page", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () =>
					"<html><body>Please confirm that you are a human</body></html>",
			})
			.mockResolvedValueOnce({
				ok: true,
				text: async () => HTML_ENDPOINT_FIXTURE,
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
			text: async () => LITE_HTML_FIXTURE,
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

	it("sends correct POST body to html endpoint", async () => {
		// Force fallback
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 403 })
			.mockResolvedValueOnce({
				ok: true,
				text: async () => HTML_ENDPOINT_FIXTURE,
			});
		vi.stubGlobal("fetch", mockFetch);

		await search("fallback test");

		const callArgs = mockFetch.mock.calls[1];
		expect(callArgs[0]).toBe("https://html.duckduckgo.com/html");
		expect(callArgs[1].method).toBe("POST");
		expect(callArgs[1].body).toContain("q=fallback+test");
		expect(callArgs[1].body).toContain("b="); // extra DDG param

		vi.unstubAllGlobals();
	});
});
