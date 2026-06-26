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
	searchBing,
	searchBrave,
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
