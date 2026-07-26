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
import { buildTitle, validateTitle, type CommitType, VALID_TYPES } from "../tools/validate";

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
			"Comandos GitHub. Subcomandos: pr create, pr list, pr view, pr edit, " +
			"issue create, issue list, issue view, issue edit, " +
			"search <query>, auth, help",
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
			"  `/github pr view <num>`  — Exibe detalhes do PR",
			"  `/github pr edit <num>`  — Edita PR (title, body, base, labels, assignees, milestone)",
			"",
			"**Issues**",
			"  `/github issue create`   — Cria issue (abre editor para body)",
			"  `/github issue list`     — Lista issues abertas",
			"  `/github issue view <num>` — Exibe detalhes da issue",
			"  `/github issue edit <num>` — Edita issue (title, body, labels, assignees, state, milestone)",
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

// ── Helpers de formulário ──────────────────────────────────────────────

async function askType(ctx: ExtensionCommandContext): Promise<CommitType | null> {
	if (!ctx.hasUI) return "feat";
	const options = VALID_TYPES.map((t) => `${t}`);
	const picked = await ctx.ui.select("Tipo da mudança:", options);
	if (!picked || !(VALID_TYPES as readonly string[]).includes(picked)) return null;
	return picked as CommitType;
}

async function askCcFields(ctx: ExtensionCommandContext): Promise<{
	type: CommitType;
	scope: string;
	titleLine: string;
	breaking: boolean;
	taskNumber?: string;
} | null> {
	const type = await askType(ctx);
	if (!type) return null;

	const scope = await ctx.ui.input("Escopo/módulo (ex: auth, api/orders, docker):", "");
	if (!scope) return null;

	const titleLine = await ctx.ui.input("Descrição curta (sem type/scope):", "");
	if (!titleLine) return null;

	const breaking = ctx.hasUI ? await ctx.ui.confirm("Breaking change?", false) : false;
	const taskStr = await ctx.ui.input("Nº da tarefa (opcional):", "");
	const taskNumber = taskStr || undefined;

	return { type, scope, titleLine, breaking, taskNumber };
}

// ── PR ─────────────────────────────────────────────────────────────────

async function handlePr(
	args: string[],
	ctx: ExtensionCommandContext,
	gh: GhApi,
) {
	const sub = args[0]?.toLowerCase();

	if (sub === "create") {
		const fields = await askCcFields(ctx);
		if (!fields) return;

		const { type, scope, titleLine, breaking, taskNumber } = fields;

		const body = ctx.hasUI
			? (await ctx.ui.editor(
					"Descrição do PR (markdown)",
					breaking
						? "BREAKING CHANGE: \n\n## O que mudou?\n\n"
						: "## O que mudou?\n\n",
			  )) ?? ""
			: "";

		const head = await ctx.ui.input("Branch de origem:", "");
		if (!head) return;

		const base = await ctx.ui.input("Branch de destino:", "main");
		const draft = await ctx.ui.confirm("Criar como draft?", false);

		const fullTitle = buildTitle({ type, scope, title: titleLine, breaking, taskNumber });
		const validation = validateTitle(fullTitle);

		if (!validation.valid) {
			ctx.ui.notify(`❌ ${validation.error}`, "error");
			return;
		}

		try {
			const result = await gh.prCreate({
				title: fullTitle,
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

	if (sub === "view") {
		const numStr = args[1];
		const num = parseInt(numStr, 10);
		if (!numStr || isNaN(num)) {
			ctx.ui.notify("Uso: /github pr view <número>", "info");
			return;
		}

		try {
			const pr = await gh.prView({ number: num });
			const lines = [
				`## ${pr.state === "OPEN" ? "🟢" : pr.state === "MERGED" ? "✅" : "🔴"} #${pr.number} — ${pr.title}`,
				`**Estado:** ${pr.state.toLowerCase()}` +
					` · **Mergeável:** ${pr.mergeable === "MERGEABLE" ? "✅ sim" : pr.mergeable === "CONFLICTING" ? "❌ conflitos" : "❓ desconhecido"}`,
				`**Branch:** \`${pr.headRefName}\` → \`${pr.baseRefName}\``,
				`**Autor:** @${pr.author.login} · ${new Date(pr.createdAt).toLocaleDateString("pt-BR")}`,
			];
			if (pr.labels.length) lines.push(`**Labels:** ${pr.labels.map(l => l.name).join(", ")}`);
			if (pr.assignees.length) lines.push(`**Assignees:** ${pr.assignees.map(a => `@${a.login}`).join(", ")}`);
			lines.push("", `**URL:** ${pr.url}`);

			if (pr.body) {
				lines.push("", "---", "", pr.body);
			} else {
				lines.push("", "*Sem descrição*");
			}

			if (pr.comments.length > 0) {
				const recent = pr.comments.slice(-3);
				lines.push("", "---", `**Comentários** (${pr.comments.length} total, exibindo ${recent.length}):`, "");
				for (const c of recent) {
					lines.push(`**@${c.author.login}** · ${new Date(c.createdAt).toLocaleDateString("pt-BR")}:`, c.body, "");
				}
			}

			ctx.ui.notify(lines.join("\n"), "info");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro ao buscar PR #${num}: ${msg}`, "error");
		}
		return;
	}

	if (sub === "edit") {
		const numStr = args[1];
		const num = parseInt(numStr, 10);
		if (!numStr || isNaN(num)) {
			ctx.ui.notify("Uso: /github pr edit <número>", "info");
			return;
		}

		try {
			const current = await gh.prView({ number: num });

			ctx.ui.notify(
				`🔄 Editando PR #${num}\n` +
				`Título atual: ${current.title}\n` +
				`Base atual: ${current.baseRefName}\n` +
				`Labels: ${current.labels.map(l => l.name).join(", ") || "(nenhuma)"}\n` +
				`Assignees: ${current.assignees.map(a => `@${a.login}`).join(", ") || "(nenhum)"}`,
				"info",
			);

			const title = await ctx.ui.input("Novo título (vazio = manter):", "");
			const body = ctx.hasUI
				? (await ctx.ui.editor("Novo body (vazio = manter):", current.body ?? "")) ?? undefined
				: undefined;
			const base = await ctx.ui.input("Nova branch base (vazio = manter):", "");
			const labelsStr = await ctx.ui.input("Labels (separadas por vírgula, vazio = manter):", "");
			const assigneesStr = await ctx.ui.input("Assignees (separados por vírgula, vazio = manter):", "");
			const milestoneStr = await ctx.ui.input("Milestone (vazio = manter):", "");

			const labels = labelsStr
				? labelsStr.split(",").map(s => s.trim()).filter(Boolean)
				: undefined;
			const assignees = assigneesStr
				? assigneesStr.split(",").map(s => s.trim()).filter(Boolean)
				: undefined;

			await gh.prEdit({
				number: num,
				title: title || undefined,
				body: body || undefined,
				base: base || undefined,
				addLabels: labels?.filter(l => !current.labels.map(x => x.name).includes(l)),
				removeLabels: labels !== undefined
					? current.labels.map(l => l.name).filter(l => !labels!.includes(l))
					: undefined,
				addAssignees: assignees?.filter(a => !current.assignees.map(x => x.login).includes(a)),
				removeAssignees: assignees !== undefined
					? current.assignees.map(a => a.login).filter(a => !assignees!.includes(a))
					: undefined,
				milestone: milestoneStr || undefined,
			});

			ctx.ui.notify(`✅ PR #${num} editado com sucesso.`, "success");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro ao editar PR #${num}: ${msg}`, "error");
		}
		return;
	}

	ctx.ui.notify(
		"Uso: /github pr create | /github pr list | /github pr view <num> | /github pr edit <num>",
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
		const fields = await askCcFields(ctx);
		if (!fields) return;

		const { type, scope, titleLine, breaking, taskNumber } = fields;

		const body = ctx.hasUI
			? (await ctx.ui.editor(
					"Descrição da issue (markdown)",
					breaking
						? "BREAKING CHANGE: \n\n## Contexto\n\n"
						: "## Contexto\n\n",
			  )) ?? ""
			: "";

		const labelsStr = await ctx.ui.input("Labels (separadas por vírgula):", "");
		const labels = labelsStr
			? labelsStr.split(",").map((s) => s.trim()).filter(Boolean)
			: undefined;

		const fullTitle = buildTitle({ type, scope, title: titleLine, breaking, taskNumber });
		const validation = validateTitle(fullTitle);

		if (!validation.valid) {
			ctx.ui.notify(`❌ ${validation.error}`, "error");
			return;
		}

		try {
			const result = await gh.issueCreate({
				title: fullTitle,
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

	if (sub === "view") {
		const numStr = args[1];
		const num = parseInt(numStr, 10);
		if (!numStr || isNaN(num)) {
			ctx.ui.notify("Uso: /github issue view <número>", "info");
			return;
		}

		try {
			const issue = await gh.issueView({ number: num });
			const lines = [
				`## ${issue.state === "OPEN" ? "🟢" : "🔴"} #${issue.number} — ${issue.title}`,
				`**Estado:** ${issue.state.toLowerCase()}`,
				`**Autor:** @${issue.author.login} · ${new Date(issue.createdAt).toLocaleDateString("pt-BR")}`,
			];
			if (issue.labels.length) lines.push(`**Labels:** ${issue.labels.map(l => l.name).join(", ")}`);
			if (issue.assignees.length) lines.push(`**Assignees:** ${issue.assignees.map(a => `@${a.login}`).join(", ")}`);
			lines.push("", `**URL:** ${issue.url}`);

			if (issue.body) {
				lines.push("", "---", "", issue.body);
			} else {
				lines.push("", "*Sem descrição*");
			}

			if (issue.comments.length > 0) {
				const recent = issue.comments.slice(-3);
				lines.push("", "---", `**Comentários** (${issue.comments.length} total, exibindo ${recent.length}):`, "");
				for (const c of recent) {
					lines.push(`**@${c.author.login}** · ${new Date(c.createdAt).toLocaleDateString("pt-BR")}:`, c.body, "");
				}
			}

			ctx.ui.notify(lines.join("\n"), "info");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro ao buscar issue #${num}: ${msg}`, "error");
		}
		return;
	}

	if (sub === "edit") {
		const numStr = args[1];
		const num = parseInt(numStr, 10);
		if (!numStr || isNaN(num)) {
			ctx.ui.notify("Uso: /github issue edit <número>", "info");
			return;
		}

		try {
			const current = await gh.issueView({ number: num });

			ctx.ui.notify(
				`🔄 Editando Issue #${num}\n` +
				`Título atual: ${current.title}\n` +
				`Estado atual: ${current.state.toLowerCase()}\n` +
				`Labels: ${current.labels.map(l => l.name).join(", ") || "(nenhuma)"}\n` +
				`Assignees: ${current.assignees.map(a => `@${a.login}`).join(", ") || "(nenhum)"}`,
				"info",
			);

			const title = await ctx.ui.input("Novo título (vazio = manter):", "");
			const body = ctx.hasUI
				? (await ctx.ui.editor("Novo body (vazio = manter):", current.body ?? "")) ?? undefined
				: undefined;
			const state = await ctx.ui.input("Novo estado (open/closed, vazio = manter):", "");
			const labelsStr = await ctx.ui.input("Labels (separadas por vírgula, vazio = manter):", "");
			const assigneesStr = await ctx.ui.input("Assignees (separados por vírgula, vazio = manter):", "");
			const milestoneStr = await ctx.ui.input("Milestone (vazio = manter):", "");

			const labels = labelsStr
				? labelsStr.split(",").map(s => s.trim()).filter(Boolean)
				: undefined;
			const assignees = assigneesStr
				? assigneesStr.split(",").map(s => s.trim()).filter(Boolean)
				: undefined;

			await gh.issueEdit({
				number: num,
				title: title || undefined,
				body: body || undefined,
				state: (state === "open" || state === "closed") ? state : undefined,
				addLabels: labels?.filter(l => !current.labels.map(x => x.name).includes(l)),
				removeLabels: labels !== undefined
					? current.labels.map(l => l.name).filter(l => !labels!.includes(l))
					: undefined,
				addAssignees: assignees?.filter(a => !current.assignees.map(x => x.login).includes(a)),
				removeAssignees: assignees !== undefined
					? current.assignees.map(a => a.login).filter(a => !assignees!.includes(a))
					: undefined,
				milestone: milestoneStr || undefined,
			});

			ctx.ui.notify(`✅ Issue #${num} editada com sucesso.`, "success");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`❌ Erro ao editar issue #${num}: ${msg}`, "error");
		}
		return;
	}

	ctx.ui.notify(
		"Uso: /github issue create | /github issue list | /github issue view <num> | /github issue edit <num>",
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
