/**
 * Tipos e schemas compartilhados da extensão pi-github.
 */

import { Type, type Static } from "typebox";

// ── Schemas dos parâmetros das tools ───────────────────────────────────
// NOTA: gh.ts usa estes tipos para wrapper do gh CLI (title/body simples).
// Os schemas CC (type, scope, quebrando, etc) estão inline nas tools.

export const CreatePrParams = Type.Object({
	title: Type.String({ description: "Título do pull request" }),
	body: Type.String({ description: "Descrição/corpo do pull request (markdown)" }),
	head: Type.String({ description: "Nome da branch de origem (com as alterações)" }),
	base: Type.Optional(Type.String({ description: "Branch de destino (padrão: main)", default: "main" })),
	draft: Type.Optional(Type.Boolean({ description: "Criar como draft PR" })),
});
export type CreatePrParams = Static<typeof CreatePrParams>;

export const CreateIssueParams = Type.Object({
	title: Type.String({ description: "Título da issue" }),
	body: Type.String({ description: "Descrição da issue (markdown)" }),
	labels: Type.Optional(Type.Array(Type.String(), { description: "Labels para aplicar" })),
	assignees: Type.Optional(Type.Array(Type.String(), { description: "Usuários para atribuir (login)" })),
});
export type CreateIssueParams = Static<typeof CreateIssueParams>;

export const SearchParams = Type.Object({
	query: Type.String({ description: "Query de busca (sintaxe de busca do GitHub)" }),
	repo: Type.Optional(Type.String({ description: "Limitar a um repositório (owner/name)" })),
	state: Type.Optional(
		Type.Union(
			[Type.Literal("open"), Type.Literal("closed"), Type.Literal("all")],
			{ description: "Filtrar por estado", default: "open" },
		),
	),
});
export type SearchParams = Static<typeof SearchParams>;

export const ListPrsParams = Type.Object({
	state: Type.Optional(
		Type.Union(
			[Type.Literal("open"), Type.Literal("closed"), Type.Literal("merged"), Type.Literal("all")],
			{ description: "Filtrar por estado", default: "open" },
		),
	),
	limit: Type.Optional(Type.Integer({ description: "Máximo de resultados", default: 10 })),
	author: Type.Optional(Type.String({ description: "Filtrar por autor (login)" })),
});
export type ListPrsParams = Static<typeof ListPrsParams>;

export const ListIssuesParams = Type.Object({
	state: Type.Optional(
		Type.Union(
			[Type.Literal("open"), Type.Literal("closed"), Type.Literal("all")],
			{ description: "Filtrar por estado", default: "open" },
		),
	),
	limit: Type.Optional(Type.Integer({ description: "Máximo de resultados", default: 10 })),
	labels: Type.Optional(Type.Array(Type.String(), { description: "Filtrar por labels" })),
});
export type ListIssuesParams = Static<typeof ListIssuesParams>;

export const ViewPrParams = Type.Object({
	number: Type.Integer({ description: "Número do pull request" }),
	repo: Type.Optional(Type.String({ description: "Repositório (owner/name). Padrão: repositório atual" })),
});
export type ViewPrParams = Static<typeof ViewPrParams>;

export const ViewIssueParams = Type.Object({
	number: Type.Integer({ description: "Número da issue" }),
	repo: Type.Optional(Type.String({ description: "Repositório (owner/name). Padrão: repositório atual" })),
});
export type ViewIssueParams = Static<typeof ViewIssueParams>;

// ── Tipos de resultado retornados pelo gh CLI ─────────────────────────

export interface GhAuthor {
	login: string;
}

export interface GhLabel {
	name: string;
}

export interface GhPrResult {
	number: number;
	title: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	headRefName: string;
	baseRefName: string;
	url: string;
	author: GhAuthor;
	createdAt: string;
	updatedAt?: string;
}

export interface GhIssueResult {
	number: number;
	title: string;
	state: "OPEN" | "CLOSED";
	url: string;
	author: GhAuthor;
	createdAt: string;
	labels?: GhLabel[];
}

export interface GhSearchResult {
	number: number;
	title: string;
	state: "OPEN" | "CLOSED";
	url: string;
	repository: { nameWithOwner: string };
	createdAt: string;
}

// ── Info de autenticação ──────────────────────────────────────────────

export interface AuthInfo {
	available: boolean;
	authenticated: boolean;
	user: string;
}

// ── Tipos de detalhes (view) ──────────────────────────────────────────

export interface GhComment {
	author: GhAuthor;
	body: string;
	createdAt: string;
	updatedAt?: string;
}

export interface GhPrDetail {
	number: number;
	title: string;
	body: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	headRefName: string;
	baseRefName: string;
	url: string;
	author: GhAuthor;
	createdAt: string;
	updatedAt?: string;
	mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
	labels: GhLabel[];
	assignees: GhAuthor[];
	comments: GhComment[];
}

export interface GhIssueDetail {
	number: number;
	title: string;
	body: string;
	state: "OPEN" | "CLOSED";
	url: string;
	author: GhAuthor;
	createdAt: string;
	labels: GhLabel[];
	assignees: GhAuthor[];
	comments: GhComment[];
}
