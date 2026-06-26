# pi-web-search

**Pi extension** — search the web via DuckDuckGo, Bing, and Brave.

Registers three tools:

- **`web_search`** — Searches DuckDuckGo (lite + html), falls back to Bing RSS, then Brave Search HTML. Returns up to 10 structured results per query.
- **`web_fetch`** — Fetches full page content from URLs, strips HTML/navigation, saves clean text.
- **`web_agent`** — Orchestrates multi-branch research: tracks searches + fetches, suggests next steps.

## Install

```bash
# npm
pi install npm:@offmiijin/pi-web-search

# git
pi install git:github.com/offmiijin/pi-web-search
```

## Usage

```text
web_search({ query: "latest Python version 2025" })
→ 10 results with title, URL, snippet

web_fetch({ urls: ["https://python.org/downloads/"] })
→ Clean text saved to /tmp/page_<date>_<random>/

web_agent({ goal: "Research best CLI tools 2025" })
→ Starts tracked research session
```

## Development

```bash
npm install
npx vitest run
```

## License

MIT
