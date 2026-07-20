/**
 * Web Search Extension — Configuration
 *
 * Stores API keys in ~/.config/pi-web-search/config.json
 * Also reads env vars as override.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "pi-web-search");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface SearchConfig {
	serperApiKey?: string;
	exaApiKey?: string;
	tavilyApiKey?: string;
	searxngKey?: string;
	searxngUrl?: string;
}

let cached: SearchConfig | null = null;

function load(): SearchConfig {
	if (cached) return cached;
	if (!existsSync(CONFIG_PATH)) {
		cached = {};
		return cached;
	}
	try {
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		cached = JSON.parse(raw) as SearchConfig;
		return cached;
	} catch {
		cached = {};
		return cached;
	}
}

function save(config: SearchConfig): void {
	if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
	cached = config;
}

/** Get key from env var first, then config file. */
function resolveKey(envVar: string, configKey: keyof SearchConfig): string | null {
	const env = process.env[envVar]?.trim();
	if (env) return env;
	const cfg = load();
	const val = cfg[configKey];
	if (typeof val === "string" && val.trim()) return val.trim();
	return null;
}

// Public API

export function getSerperKey(): string | null {
	return resolveKey("SERPER_API_KEY", "serperApiKey");
}

export function getExaKey(): string | null {
	return resolveKey("EXA_API_KEY", "exaApiKey");
}

export function getTavilyKey(): string | null {
	return resolveKey("TAVILY_API_KEY", "tavilyApiKey");
}

export function getSearxngKey(): string | null {
	return resolveKey("SEARXNG_KEY", "searxngKey");
}

export function getSearxngUrl(): string | null {
	return resolveKey("SEARXNG_URL", "searxngUrl");
}

export function setKey(provider: string, key: string): void {
	const cfg = load();
	switch (provider) {
		case "serper":
		case "serper.dev":
			cfg.serperApiKey = key;
			break;
		case "exa":
			cfg.exaApiKey = key;
			break;
		case "tavily":
			cfg.tavilyApiKey = key;
			break;
		case "searxng":
		case "searx":
			cfg.searxngKey = key;
			break;
		case "searxng-url":
		case "searxngurl":
			cfg.searxngUrl = key;
			break;
		default:
			throw new Error(`Unknown provider: ${provider}. Use: serper, exa, tavily, searxng`);
	}
	save(cfg);
}

export function getConfiguredProviders(): string[] {
	const cfg = load();
	const providers: string[] = [];
	if (cfg.serperApiKey) providers.push("serper.dev");
	if (cfg.exaApiKey) providers.push("exa");
	if (cfg.tavilyApiKey) providers.push("tavily");
	if (cfg.searxngKey) providers.push("searxng");
	return providers;
}

export function getConfigSummary(): string {
	const cfg = load();
	const lines: string[] = ["## Web Search Configuration", ""];
	const add = (name: string, key: string | null) => {
		lines.push(`  ${key ? "✅" : "❌"} ${name}: ${key ? key.slice(0, 8) + "…" : "not set"}`);
	};
	add("Serper.dev", cfg.serperApiKey ?? null);
	add("Exa", cfg.exaApiKey ?? null);
	add("Tavily", cfg.tavilyApiKey ?? null);
	add("SearXNG", cfg.searxngKey ?? null);
	lines.push("");
	const searxngUrl = cfg.searxngUrl ?? "http://localhost:4000";
	lines.push(`  SearXNG URL: ${searxngUrl}`);
	lines.push("");
	lines.push("Set keys via:");
	lines.push("  /web_search config <provider> <key>");
	lines.push("  Or env vars: SERPER_API_KEY, EXA_API_KEY, TAVILY_API_KEY, SEARXNG_KEY, SEARXNG_URL");
	return lines.join("\n");
}
