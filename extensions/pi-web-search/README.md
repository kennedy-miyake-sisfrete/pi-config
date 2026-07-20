# pi-web-search

**Pi extension** — search the web via SearXNG (local) → Tavily → Exa → Serper.dev.

Registers three tools:

- **`web_search`** — Searches via SearXNG → Tavily → Exa → Serper.dev auto-fallback.
  Returns up to 10 results (title, URL only — no content) per query.
- **`web_fetch`** — Fetches full page content from URLs, strips HTML/navigation, saves clean text.
- **`web_agent`** — Orchestrates multi-branch research: tracks searches + fetches, suggests next steps.

Also adds a command:

- **`/web_search config <provider> <key>`** — Save an API key.

## Install

```bash
# npm
pi install npm:@offmiijin/pi-web-search

# git
pi install git:github.com/offmiijin/pi-web-search
```

## Engines

| Order | Engine | Cost | Auth |
|-------|--------|------|------|
| 1st | **SearXNG** (local Docker) | Free, no limits | Optional `X-API-Key` header |
| 2nd | **Tavily** (cloud) | 1k/mo free, requires CC | `TAVILY_API_KEY` |
| 3rd | **Exa** (cloud) | 1k/mo free, requires CC | `EXA_API_KEY` |
| 4th | **Serper.dev** (cloud) | 2.5k/mo free, no CC | `SERPER_API_KEY` |

SearXNG is tried first because it's local, free, and has no rate limits.
If it's not running or fails, the cascade falls back to cloud engines.

## SearXNG (Docker)

Start SearXNG locally:

```bash
# 1. Copy and edit env vars
cp .env.example .env
# Set SEARXNG_KEY to a random 64-char hex string: openssl rand -hex 32

# 2. Start SearXNG
docker compose up -d

# 3. Verify: http://localhost:4000/
```

The engine automatically uses `http://localhost:4000` as the SearXNG URL.
Override via `SEARXNG_URL` env var or `/web_search config searxng-url <url>`.

`SEARXNG_KEY` is:
- Used as `SEARXNG_SECRET_KEY` in the Docker container (required by SearXNG)
- Sent as `X-API-Key` header when calling the SearXNG API (optional auth)

## API Keys

Configure at least one cloud provider as fallback.

### Via command (recommended)

```text
/web_search config serper <your-serper-key>
/web_search config exa <your-exa-key>
/web_search config tavily <your-tavily-key>
/web_search config searxng <your-key>
```

Keys saved to `~/.config/pi-web-search/config.json`.

### Via environment variables

```bash
export SEARXNG_KEY="..."
export SEARXNG_URL="http://localhost:4000"
export SERPER_API_KEY="..."
export EXA_API_KEY="..."
export TAVILY_API_KEY="..."
```

Env vars override config file values.

### Provider free tiers

| Provider | Free tier | Sign up |
|----------|-----------|---------|
| **SearXNG** | Unlimited (self-hosted) | https://docs.searxng.org/ |
| **Serper.dev** | 2,500 queries/mo, no CC | https://serper.dev |
| **Exa** | 1,000 queries/mo, requires CC | https://exa.ai |
| **Tavily** | 1,000 queries/mo, requires CC | https://tavily.com |

## Usage

```text
web_search({ query: "latest Python version 2026" })
→ 10 results with title, URL, snippet

web_fetch({ urls: ["https://python.org/downloads/"] })
→ Clean text saved to <cwd>/.web-fetch-cache/page_<date>_<random>/

web_agent({ goal: "Research best CLI tools" })
→ Starts tracked research session
```

## Development

```bash
npm install
npx vitest run
```

## How it works

1. `web_search` calls `search()` which tries **SearXNG** first
2. If SearXNG fails (not running, timeout), falls back to Tavily
3. If Tavily also fails, falls back to Exa
4. If Exa also fails, falls back to Serper.dev
5. If all fail, returns a clear error with setup instructions

## License

MIT
