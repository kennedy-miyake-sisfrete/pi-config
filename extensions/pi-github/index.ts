/**
 * Extensão pi-github — Integração com GitHub (PRs, Issues, Search).
 *
 * Tools (LLM chama automaticamente):
 *   github_create_pr     → Cria pull request
 *   github_create_issue  → Cria issue
 *   github_search        → Busca issues/PRs
 *   github_list_prs      → Lista pull requests
 *   github_list_issues   → Lista issues
 *
 * Comandos (/github):
 *   /github pr create    → Cria PR com editor interativo
 *   /github pr list      → Lista PRs com seletor
 *   /github issue create → Cria issue com editor interativo
 *   /github issue list   → Lista issues com seletor
 *   /github search       → Busca interativa
 *   /github auth         → Mostra status da autenticação
 *   /github help         → Ajuda
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createGh } from "./gh";
import { getAuthInfo } from "./auth";
import { createPrTool } from "./tools/create-pr";
import { createIssueTool } from "./tools/create-issue";
import { searchTool } from "./tools/search";
import { listPrsTool } from "./tools/list-prs";
import { listIssuesTool } from "./tools/list-issues";

export default function (pi: ExtensionAPI) {
	// ── gh disponível? ────────────────────────────────────────────────
	const auth = getAuthInfo();
	if (!auth.available) {
		// gh não instalado — registra tools que reportam erro claro
		pi.sendMessage({
			customType: "github_status",
			content: "⚠️ gh CLI não encontrado. Tools GitHub desativadas. Instale: `apt install gh`",
			display: true,
		});
		return;
	}

	// ── gh wrapper (runtime) ──────────────────────────────────────────
	const gh = createGh(pi.exec.bind(pi));

	if (!auth.authenticated) {
		pi.sendMessage({
			customType: "github_status",
			content:
				"⚠️ gh CLI não autenticado. Tools podem falhar. Autentique: `gh auth login` ou exporte GH_TOKEN",
			display: true,
		});
	}

	// ── Tools ─────────────────────────────────────────────────────────
	pi.registerTool(createPrTool(gh));
	pi.registerTool(createIssueTool(gh));
	pi.registerTool(searchTool(gh));
	pi.registerTool(listPrsTool(gh));
	pi.registerTool(listIssuesTool(gh));

	// ── Comandos ──────────────────────────────────────────────────────
	// (implementado em etapas subsequentes)
	//
	// import { createGithubCommand } from "./commands/github";
	// pi.registerCommand("github", createGithubCommand(gh));
}
