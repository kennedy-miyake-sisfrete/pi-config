/**
 * Tests for engines.ts
 *
 * Covers: parseBingRss, parseBraveHtml, and full search functions
 * with mocked fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock randomDelay and throttleSearch so tests run instantly
vi.mock("../utils", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		randomDelay: vi.fn().mockResolvedValue(undefined),
		throttleSearch: vi.fn().mockResolvedValue(undefined),
	};
});

import {
	parseBingRss,
	parseBraveHtml,
	parseLiteHtml,
	parseHtmlEndpoint,
	isBlockPage,
	searchBing,
	searchBrave,
	searchDDGLite,
	searchDDGHtml,
} from "../engines";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BING_RSS_FIXTURE = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0">
  <channel>
    <title>Bing: test query</title>
    <link>https://www.bing.com/search?q=test+query</link>
    <description>Search results</description>
    <item>
      <title>First Result — Cool Page</title>
      <link>https://example.com/page1</link>
      <description>This is the description for the first result with useful info.</description>
    </item>
    <item>
      <title>Second Result Article</title>
      <link>https://example.org/article</link>
      <description>Description for the second result with more details.</description>
    </item>
    <item>
      <title>Third Result</title>
      <link>https://docs.example.com/guide</link>
      <description>Reference guide description for the third result.</description>
    </item>
  </channel>
</rss>`;

const BING_RSS_EMPTY = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0">
  <channel>
    <title>Bing: empty</title>
    <link>https://www.bing.com/search?q=empty</link>
    <description>No results</description>
  </channel>
</rss>`;

const BRAVE_HTML_FIXTURE = `<!doctype html>
<html lang="en-us">
<head><title>test query — Brave Search</title></head>
<body>
<div class="snippet " id="r1">
  <div class="site-name-content svelte-on1hvy">
    <div class="desktop-small-semibold t-secondary text-ellipsis">Example</div>
  </div>
  <a class="desktop-heading-h3 svelte-1sgcwbg" href="https://example.com/page1">First Result — Brave Page</a>
  <div class="generic-snippet svelte-1cwdgg3">
    <div class="content desktop-default-regular t-primary line-clamp-dynamic svelte-1cwdgg3">
      This is the snippet for the first Brave result.
    </div>
  </div>
</div>
<div class="snippet " id="r2">
  <div class="site-name-content svelte-on1hvy">
    <div class="desktop-small-semibold t-secondary text-ellipsis">Docs</div>
  </div>
  <a class="desktop-heading-h3 svelte-1sgcwbg" href="https://docs.example.com/guide">Brave Second Result — Guide</a>
  <div class="generic-snippet svelte-1cwdgg3">
    <div class="content desktop-default-regular t-primary line-clamp-dynamic svelte-1cwdgg3">
      Description for the second Brave result.
    </div>
  </div>
</div>
</body>
</html>`;

const BRAVE_NO_RESULTS = `<!doctype html>
<html lang="en-us">
<head><title>no results — Brave Search</title></head>
<body><p>No results found for your query.</p></body>
</html>`;

// ---------------------------------------------------------------------------
// parseBingRss
// ---------------------------------------------------------------------------
describe("parseBingRss", () => {
	it("extracts 3 results from valid RSS", () => {
		const results = parseBingRss(BING_RSS_FIXTURE);
		expect(results).toHaveLength(3);
	});

	it("extracts correct title, url, and snippet", () => {
		const results = parseBingRss(BING_RSS_FIXTURE);

		expect(results[0]).toEqual({
			title: "First Result — Cool Page",
			url: "https://example.com/page1",
			snippet: "This is the description for the first result with useful info.",
		});

		expect(results[1]).toEqual({
			title: "Second Result Article",
			url: "https://example.org/article",
			snippet: "Description for the second result with more details.",
		});
	});

	it("returns empty array for RSS without items", () => {
		const results = parseBingRss(BING_RSS_EMPTY);
		expect(results).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		const results = parseBingRss("");
		expect(results).toEqual([]);
	});

	it("returns empty array for malformed XML", () => {
		const results = parseBingRss("not xml at all");
		expect(results).toEqual([]);
	});

	it("skips items without title", () => {
		const xml = `<?xml version="1.0"?><rss><channel>
      <item><link>https://x.com</link><description>desc</description></item>
      <item><title>Has Title</title><link>https://y.com</link><description>desc2</description></item>
    </channel></rss>`;
		const results = parseBingRss(xml);
		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("Has Title");
	});
});

// ---------------------------------------------------------------------------
// parseBraveHtml
// ---------------------------------------------------------------------------
describe("parseBraveHtml", () => {
	it("extracts results from valid Brave HTML", () => {
		const results = parseBraveHtml(BRAVE_HTML_FIXTURE);
		expect(results).toHaveLength(2);
	});

	it("extracts correct fields", () => {
		const results = parseBraveHtml(BRAVE_HTML_FIXTURE);

		expect(results[0]).toEqual({
			title: "First Result — Brave Page",
			url: "https://example.com/page1",
			snippet: "This is the snippet for the first Brave result.",
		});

		expect(results[1]).toEqual({
			title: "Brave Second Result — Guide",
			url: "https://docs.example.com/guide",
			snippet: "Description for the second Brave result.",
		});
	});

	it("returns empty array for HTML without results", () => {
		const results = parseBraveHtml(BRAVE_NO_RESULTS);
		expect(results).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		const results = parseBraveHtml("");
		expect(results).toEqual([]);
	});

	it("skips internal links", () => {
		const html = `<html><body>
      <a class="desktop-heading-h3 svelte-x" href="/search">Internal</a>
      <a class="desktop-heading-h3 svelte-x" href="https://real.com/page">Real Page</a>
    </body></html>`;
		const results = parseBraveHtml(html);
		expect(results).toHaveLength(1);
		expect(results[0].url).toBe("https://real.com/page");
	});
});

// ---------------------------------------------------------------------------
// DuckDuckGo fixtures
// ---------------------------------------------------------------------------

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

const BLOCK_PAGE_HTML = `<html><body>Please confirm that you are a human</body></html>`;

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
// searchDDGLite — integration with mocked fetch
// ---------------------------------------------------------------------------
describe("searchDDGLite", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns results from lite endpoint", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => LITE_HTML_FIXTURE,
		});
		vi.stubGlobal("fetch", mockFetch);

		const result = await searchDDGLite("test query");
		expect(result.results).toHaveLength(3);
		expect(result.results[0].title).toBe("First Result Title");

		vi.unstubAllGlobals();
	});

	it("returns error on HTTP failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 403 }),
		);

		const result = await searchDDGLite("fail");
		expect(result.results).toEqual([]);
		expect(result.error).toContain("403");

		vi.unstubAllGlobals();
	});

	it("detects block page", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: async () => BLOCK_PAGE_HTML,
			}),
		);

		const result = await searchDDGLite("query");
		expect(result.results).toEqual([]);
		expect(result.error).toContain("BLOCKED");

		vi.unstubAllGlobals();
	});

	it("sends correct POST body", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => LITE_HTML_FIXTURE,
		});
		vi.stubGlobal("fetch", mockFetch);

		await searchDDGLite("node.js testing");
		const callArgs = mockFetch.mock.calls[0];
		expect(callArgs[0]).toBe("https://lite.duckduckgo.com/lite/");
		expect(callArgs[1].method).toBe("POST");
		expect(callArgs[1].body).toBe("q=node.js+testing");
		expect(callArgs[1].headers["Content-Type"]).toBe(
			"application/x-www-form-urlencoded",
		);

		vi.unstubAllGlobals();
	});
});

// ---------------------------------------------------------------------------
// searchDDGHtml — integration with mocked fetch
// ---------------------------------------------------------------------------
describe("searchDDGHtml", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns results from html endpoint", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => HTML_ENDPOINT_FIXTURE,
		});
		vi.stubGlobal("fetch", mockFetch);

		const result = await searchDDGHtml("test query");
		expect(result.results).toHaveLength(2);
		expect(result.results[0].title).toBe("First Result Title");

		vi.unstubAllGlobals();
	});

	it("sends correct POST body with b= param", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => HTML_ENDPOINT_FIXTURE,
		});
		vi.stubGlobal("fetch", mockFetch);

		await searchDDGHtml("fallback test");
		const callArgs = mockFetch.mock.calls[0];
		expect(callArgs[0]).toBe("https://html.duckduckgo.com/html");
		expect(callArgs[1].method).toBe("POST");
		expect(callArgs[1].body).toContain("q=fallback+test");
		expect(callArgs[1].body).toContain("b=");

		vi.unstubAllGlobals();
	});
});

// ---------------------------------------------------------------------------
// searchBing — integration with mocked fetch
// ---------------------------------------------------------------------------
describe("searchBing", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: async () => BING_RSS_FIXTURE,
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns results from Bing RSS", async () => {
		const result = await searchBing("test query");
		expect(result.results).toHaveLength(3);
		expect(result.results[0].title).toBe("First Result — Cool Page");
	});

	it("returns error on HTTP failure", async () => {
		(globalThis.fetch as any).mockResolvedValue({
			ok: false,
			status: 503,
		});
		const result = await searchBing("fail");
		expect(result.results).toEqual([]);
		expect(result.error).toContain("503");
	});

	it("returns error on network failure", async () => {
		(globalThis.fetch as any).mockRejectedValue(new Error("ENOTFOUND"));
		const result = await searchBing("fail");
		expect(result.results).toEqual([]);
		expect(result.error).toContain("ENOTFOUND");
	});

	it("sends correct URL with encoded query", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => BING_RSS_FIXTURE,
		});
		vi.stubGlobal("fetch", mockFetch);

		await searchBing("node.js testing");
		const callUrl = mockFetch.mock.calls[0][0];
		expect(callUrl).toContain("bing.com/search");
		expect(callUrl).toContain("format=rss");
		expect(callUrl).toContain(encodeURIComponent("node.js testing"));
	});
});

// ---------------------------------------------------------------------------
// searchBrave — integration with mocked fetch
// ---------------------------------------------------------------------------
describe("searchBrave", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: async () => BRAVE_HTML_FIXTURE,
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns results from Brave HTML", async () => {
		const result = await searchBrave("test query");
		expect(result.results).toHaveLength(2);
		expect(result.results[0].title).toBe("First Result — Brave Page");
	});

	it("returns error on HTTP failure", async () => {
		(globalThis.fetch as any).mockResolvedValue({
			ok: false,
			status: 403,
		});
		const result = await searchBrave("fail");
		expect(result.results).toEqual([]);
		expect(result.error).toContain("403");
	});

	it("returns error on network failure", async () => {
		(globalThis.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"));
		const result = await searchBrave("fail");
		expect(result.results).toEqual([]);
		expect(result.error).toContain("ECONNREFUSED");
	});

	it("detects captcha page", async () => {
		(globalThis.fetch as any).mockResolvedValue({
			ok: true,
			text: async () =>
				"<html><body>Please complete the captcha</body></html>",
		});
		const result = await searchBrave("query");
		expect(result.results).toEqual([]);
		expect(result.error).toContain("captcha");
	});

	it("sends correct URL with encoded query", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => BRAVE_HTML_FIXTURE,
		});
		vi.stubGlobal("fetch", mockFetch);

		await searchBrave("test query");
		const callUrl = mockFetch.mock.calls[0][0];
		expect(callUrl).toContain("search.brave.com/search");
		expect(callUrl).toContain(encodeURIComponent("test query"));
	});
});
