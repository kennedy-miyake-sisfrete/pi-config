/**
 * Web Search Extension — Shared Engine Types
 */

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface EngineResult {
	results: SearchResult[];
	error?: string;
}
