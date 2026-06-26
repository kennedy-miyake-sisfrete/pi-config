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

Three tools work together:

### `web_agent` — Orchestrate Multi-Branch Research

Starts a research session. Call this **first** with a strategic goal.

- **Parameter:** `goal` (string, optional) — research objective. Omit to query current session state.
- **Auto-tracking:** Monitors `web_search` and `web_fetch` calls, maintaining session state automatically.
- **State persistence:** Same goal reuses accumulated state; new goal resets the session.
- **Output:** Research header with searches, discovered URLs, pages fetched, and contextual suggestions.

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

### Multi-Branch Research Flow (recommended)

For complex or broad research topics, use `web_agent` to orchestrate multiple searches and fetches:

```
1. PLAN    → web_agent({ goal: "..." })    ← starts session, return suggestions
2. SEARCH  → web_search(query1)              ← LLM crafts queries from suggestions
3. SEARCH  → web_search(query2)              ← multiple branches
4. SEARCH  → web_search(queryN)
5. EVALUATE → web_agent({})                  ← query updated state
6. FETCH   → web_fetch([url1, url2, ...])    ← fetch discovered URLs
7. EVALUATE → web_agent({})                  ← query updated state again
8. REPEAT  → loop steps 2–7 until satisfied
9. ANSWER  → synthesize findings
```

### Quick Research Flow (single topic)

For simple, focused lookups where a single search suffices:

```
1. SEARCH   → web_search(query)
2. FETCH    → web_fetch([url1, url2, ...])
3. READ     → read /tmp/page_<date>_<hash>/...
4. ANSWER   → synthesize findings
```

## Step-by-step (Multi-Branch)

1. **Call `web_agent`** with a strategic research `goal`. Analyze the suggestions for initial queries.
2. **Call `web_search`** multiple times with different queries to cover different angles of the goal.
3. **Call `web_agent`** (omit goal) to check which URLs were discovered and not yet fetched.
4. **Call `web_fetch`** with the discovered URLs to get full page content.
5. **Call `web_agent`** again to check progress. Repeat search/fetch as needed.
6. Once `web_agent` suggests "Research complete — summarize findings", synthesize and answer.

## Best Practices

- **Always start complex research with `web_agent`.** Let it track your progress automatically.
- **Call `web_agent` (no goal) between steps** to check discovered URLs and suggestions.
- **Diversify queries.** Use the suggestions from `web_agent` to cover different angles.
- **Fetch before citing.** Snippets can be misleading. Always call `web_fetch` on important URLs.
- **Report errors transparently.** If some URLs failed, say so: "Found 10 results but only 8 loaded."
- **Respect the 10-call limit on `web_search`.** Use each call strategically.
- **Use `read` to access saved files.** The output directory path is shown in `web_fetch`'s response.

## Example (Multi-Branch)

```
User: What are the best CLI tools for developers to boost productivity?

Agent:
1. web_agent({ "goal": "Find best CLI productivity tools for developers 2024/2025" })
   → ## 🧠 Research: "..."
      ### Searches (0)
      ### Suggestions
      - Break down the goal into specific search queries
      - Start by calling web_search with targeted terms

2. web_search("best CLI productivity tools fullstack developers 2025")
   → 10 results

3. web_search("modern Unix tool replacements ls cat grep find")
   → 10 results

4. web_search("developer CLI utilities git helpers API testing")
   → 8 results

5. web_agent({})
   → ### Searches (3)
     ✅ "best CLI productivity..." → 10 results
     ✅ "modern Unix tool..." → 10 results
     ✅ "developer CLI utilities..." → 8 results
     ### Discovered URLs (15 not yet fetched)
       🔗 https://github.com/...
       🔗 https://dev.to/...
       ...
     ### Suggestions
       - web_fetch 15 discovered URL(s) to get page content

6. web_fetch(["https://github.com/...", "https://dev.to/...", ...])
   → Fetched 15 URLs → /tmp/page_20260625_a1b2c3d4/

7. web_agent({})
   → ### Pages Fetched (15)
     ✅ https://github.com/... → filename (12.3 KB)
     ❌ https://broken.com/... → ENOTFOUND
     ### Suggestions
       - 1 page fetch(es) failed — check URLs for typos or access

8. web_agent({ "goal": "Find benchmarking data for these CLI tools" })
   → Refined goal, new search cycle begins

9. web_search("CLI tool performance benchmarks 2025")
   → ...
```

## Example (Quick Flow)

```
User: What's the current Python version?

Agent:
1. web_search("current Python version 2025")
   → 10 results

2. web_fetch(["https://python.org/downloads/"])
   → Fetched 1 URL → /tmp/page_20260625_x1y2z3/

3. read /tmp/page_20260625_x1y2z3/https_python_org_downloads.txt
   → "Python 3.13.3"

4. Answer: The latest Python version is 3.13.3.
```
