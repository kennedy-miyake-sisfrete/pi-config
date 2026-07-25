/**
 * Comando /github — interface interativa para GitHub.
 *
 * Subcomandos:
 *   /github pr create        → Cria PR com editor para body
 *   /github pr list          → Lista PRs com seletor
 *   /github issue create     → Cria issue com editor para body
 *   /github issue list       → Lista issues com seletor
 *   /github search           → Busca interativa
 *   /github auth             → Mostra status da autenticação
 *   /github help             → Mostra ajuda
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { GhApi } from "../gh";

type Cmd = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

/**
 * Cria handler para /github command.
 */
export function createGithubCommand(gh: GhApi): {
	description: string;
	handler: Cmd;
} {
	return {
		description:
			"Comandos GitHub. Subcomandos: pr create, pr list, issue create, " +
			"issue list, search <query>, auth, help",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/);
			const cmd = parts[0]?.toLowerCase() ?? "";

			switch (cmd) {
				case "pr":
					return handlePr(parts.slice(1), ctx, gh);
				case "issue":
					return handleIssue(parts.slice(1), ctx, gh);
				case "search":
					return handleSearch(parts.slice(1), ctx, gh);
				case "auth":
					return handleAuth(ctx, gh);
				case "help":
				case "":
					return handleHelp(ctx);
				default:
					ctx.ui.notify(
						`❌ Subcomando desconhecido: "${cmd}". Use /github help`,
						"error",
					);
			}
		},
	};
}

// ── Help ───────────────────────────────────────────────────────────────

async function handleHelp(ctx: ExtensionCommandContext) {
	ctx.ui.notify(
		[
			"**/github — Comandos GitHub**",
			"",
			"**PRs**",
			"  `/github pr create`      — Cria PR (abre editor para body)",
			"  `/github pr list`        — Lista PRs abertas",
			"",
			"**Issues**",
			"  `/github issue create`   — Cria issue (abre editor para body)",
			"  `/github issue list`     — Lista issues abertas",
			"",
			"**Busca**",
			"  `/github search <query>` — Busca issues/PRs",
			"",
			"**Config**",
			"  `/github auth`           — Status da autenticação",
			"  `/github help`           — Esta ajuda",
		].join("\n"),
		"info",
	);
}

// ── PR ─────────────────────────────────────────────────────────────────

async function handlePr(
	args: string[],
	ctx: ExtensionCommandContext,
	gh: GhApi,
) {
	const sub = args[0]?.toLowerCase();

	if (sub === "create") {
		const title = await ctx.ui.input("Título do PR:", "");
		if (!title) return;

		const body = ctx.hasUI
			? (await ctx.ui.editor("Descrição do PR (markdown)", "## O que mudou?\n\n")) ?? ""
			: "";

		const head = await ctx.ui.input("Branch de origem:", "");
		if (!head) return;

		const base = await ctx.ui.input("Branch de destino:", "main");
		const draft = await ctx.ui.confirm("Criar como draft?", false);

		try {
			const result = await gh.prCreate({
				title,
				body,
				head,
				base: base || "main",
				draft,
			});
			ctx.ui.notify(
				`✅ PR #${result.number} criado: ${result.url}`,
				"success",
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro: ${msg}`, "error");
		}
		return;
	}

	if (sub === "list" || sub === "ls") {
		try {
			const prs = await gh.prList({ state: "open", limit: 20 });

			if (prs.length === 0) {
				ctx.ui.notify("📭 Nenhum PR aberto.", "info");
				return;
			}

			const labels = prs.map(
				(p) => `#${p.number} ${p.title} [${p.headRefName}→${p.baseRefName}] @${p.author.login}`,
			);

			if (!ctx.hasUI) {
				const lines = prs.map(
					(p) =>
						`#${p.number} — ${p.title} (${p.headRefName}→${p.baseRefName}) @${p.author.login}`,
				);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			const selected = await ctx.ui.select("PRs abertos:", labels);
			if (!selected) return;

			const num = parseInt(selected.match(/^#(\d+)/)?.[1] ?? "0", 10);
			const pr = prs.find((p) => p.number === num);
			if (pr) {
				ctx.ui.notify(
					`**#${pr.number} — ${pr.title}**\n` +
						`Estado: ${pr.state}\n` +
						`Branch: \`${pr.headRefName}\` → \`${pr.baseRefName}\`\n` +
						`Autor: @${pr.author.login}\n` +
						`URL: ${pr.url}`,
					"info",
				);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro: ${msg}`, "error");
		}
		return;
	}

	ctx.ui.notify(
		"Uso: /github pr create | /github pr list",
		"info",
	);
}

// ── Issue ──────────────────────────────────────────────────────────────

async function handleIssue(
	args: string[],
	ctx: ExtensionCommandContext,
	gh: GhApi,
) {
	const sub = args[0]?.toLowerCase();

	if (sub === "create") {
		const title = await ctx.ui.input("Título da issue:", "");
		if (!title) return;

		const body = ctx.hasUI
			? (await ctx.ui.editor("Descrição da issue (markdown)", "## Contexto\n\n")) ?? ""
			: "";

		const labelsStr = await ctx.ui.input("Labels (separadas por vírgula):", "");
		const labels = labelsStr
			? labelsStr.split(",").map((s) => s.trim()).filter(Boolean)
			: undefined;

		try {
			const result = await gh.issueCreate({
				title,
				body,
				labels,
			});
			ctx.ui.notify(
				`✅ Issue #${result.number} criada: ${result.url}`,
				"success",
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro: ${msg}`, "error");
		}
		return;
	}

	if (sub === "list" || sub === "ls") {
		try {
			const issues = await gh.issueList({ state: "open", limit: 20 });

			if (issues.length === 0) {
				ctx.ui.notify("📭 Nenhuma issue aberta.", "info");
				return;
			}

			const labels = issues.map(
				(i) =>
					`#${i.number} ${i.title}` +
					(i.labels?.length ? ` [${i.labels.map((l) => l.name).join(", ")}]` : "") +
					` @${i.author.login}`,
			);

			if (!ctx.hasUI) {
				ctx.ui.notify(labels.join("\n"), "info");
				return;
			}

			const selected = await ctx.ui.select("Issues abertas:", labels);
			if (!selected) return;

			const num = parseInt(selected.match(/^#(\d+)/)?.[1] ?? "0", 10);
			const issue = issues.find((i) => i.number === num);
			if (issue) {
				ctx.ui.notify(
					`**#${issue.number} — ${issue.title}**\n` +
						`Estado: ${issue.state}\n` +
						`Autor: @${issue.author.login}\n` +
						(issue.labels?.length
							? `Labels: ${issue.labels.map((l) => l.name).join(", ")}\n`
							: "") +
						`URL: ${issue.url}`,
					"info",
				);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro: ${msg}`, "error");
		}
		return;
	}

	ctx.ui.notify(
		"Uso: /github issue create | /github issue list",
		"info",
	);
}

// ── Search ─────────────────────────────────────────────────────────────

async function handleSearch(
	args: string[],
	ctx: ExtensionCommandContext,
	gh: GhApi,
) {
	const query = args.join(" ") || (await ctx.ui.input("Query de busca:", ""));
	if (!query) return;

	try {
		const results = await gh.search({ query });

		if (results.length === 0) {
			ctx.ui.notify(`🔍 Nenhum resultado para "${query}"`, "info");
			return;
		}

		const lines = results.map(
			(r) =>
				`#${r.number} — ${r.title} (${r.repository.nameWithOwner}) [${r.state}]`,
		);
		ctx.ui.notify(lines.join("\n"), "info");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(`❌ Erro na busca: ${msg}`, "error");
	}
}

// ── Auth ───────────────────────────────────────────────────────────────

async function handleAuth(ctx: ExtensionCommandContext, gh: GhApi) {
	try {
		const { user } = await gh.getUser();
		ctx.ui.notify(
			`✅ Autenticado no GitHub como **@${user}**`,
			"success",
		);
	} catch {
		ctx.ui.notify(
			"❌ Não autenticado. Use `gh auth login` ou exporte GH_TOKEN.",
			"error",
		);
	}
}
