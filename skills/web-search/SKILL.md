---
name: web-search
description: Search the web via DuckDuckGo and fetch full page content. Use when you need current information beyond your training data, real-time facts, documentation lookups, or any web research. Always prefers web_search for finding URLs and web_fetch for content extraction.
---

# Web Search

## When to Use

Use this skill when the user asks about:
- Current events, recent news, or time-sensitive topics
- Latest documentation, API references, or technical specs
- Facts or data that may have changed since your training cutoff
- Any web research task requiring up-to-date information

## Tools

Two tools work together:

### `web_search` — Find URLs

Searches DuckDuckGo and returns up to 10 results with title, URL, and snippet.

- **Parameter:** `query` (string) — the search terms
- **Endpoint:** POSTs to `lite.duckduckgo.com/lite/` (falls back to `html.duckduckgo.com/html`)
- **Limits:** You may call up to **10 times** per research session
- **Rotates:** User-Agent per request to avoid blocking

### `web_fetch` — Extract Content

Fetches full page content from a list of URLs, strips HTML/scripts/navigation, and saves clean text to disk.

- **Parameter:** `urls` (string[]) — pass all collected URLs in one call
- **Concurrency:** Processes up to **10 URLs in parallel**; excess URLs are queued automatically
- **Output:** Each page saved to `/tmp/page_<YYYYMMDD>_<random>/<sanitized-url>.txt`
- **Throttling:** Each request uses a random User-Agent + random 500–2000ms delay
- **Limits:** 15s timeout per URL; non-HTML content types are skipped

## Workflow

### Standard Research Flow

```
1. SEARCH   → web_search(query)               ← up to 10 calls
2. EVALUATE → review snippets, identify useful URLs
3. FETCH    → web_fetch([url1, url2, ...])     ← all URLs in one call
4. READ     → read /tmp/page_<date>_<hash>/... ← inspect saved files
5. ANSWER   → synthesize findings for the user
```

### Step-by-step

1. **Call `web_search`** with the user's question. Review the 10 results (title + snippet).
2. **If results are insufficient**, call `web_search` again with a refined or different query (e.g., different wording, alternate source). You may call up to 10 times.
3. **Once you have enough URLs**, deduplicate them and call **`web_fetch`** with all collected URLs in a single call.
4. **Use `read`** to open the saved text files from the directory shown in the `web_fetch` result.
5. **Synthesize** the content and respond to the user with a clear, attributed answer.

## Best Practices

- **Be specific with queries.** `"Python 3.13 pattern matching match case syntax"` is better than `"Python 3.13"`.
- **Diversify sources.** Call `web_search` 2–3 times with different angles (official docs, tutorials, stack overflow) rather than one broad query.
- **Call `web_fetch` once.** Collect all useful URLs first, then pass them all in a single `web_fetch` call.
- **Always fetch before citing.** Snippets can be misleading. Get the full text before quoting.
- **Report errors transparently.** If some URLs failed, say so: "I found 10 results but only 8 loaded successfully."
- **Respect the 10-call limit on `web_search`.** Use each call strategically.
- **Use `read` to access saved files.** The output directory path is shown in `web_fetch`'s response.

## Example

```
User: What are the latest best practices for TypeScript 5.5?

Agent:
1. web_search("TypeScript 5.5 best practices")
   → 10 results with snippets

2. web_search("TypeScript 5.5 new features release notes")
   → 10 more results

3. web_fetch([
     "https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/",
     "https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html",
     ...
   ])
   → Files saved to /tmp/page_20260623_a1b2c3d4/

4. read /tmp/page_20260623_a1b2c3d4/...
   → Full text content extracted

5. Synthesized answer with citations
```
