/**
 * Tool: github_create_pr
 *
 * Cria pull request via gh CLI.
 * LLM usa quando precisa abrir PR após alterações.
 */

import { Type } from "typebox";
import type { GhApi } from "../gh";

export function createPrTool(gh: GhApi) {
	return {
		name: "github_create_pr",
		label: "GitHub: Create PR",
		description:
			"Cria um pull request no GitHub. Use após fazer alterações em uma branch. " +
			"Parâmetros: title (título), body (descrição em markdown), head (branch origem), " +
			"base (branch destino, padrão main), draft (se true, cria como draft PR).",

		parameters: Type.Object({
			title: Type.String({ description: "Título do pull request" }),
			body: Type.String({ description: "Descrição/corpo do pull request (markdown)" }),
			head: Type.String({ description: "Nome da branch de origem (com as alterações)" }),
			base: Type.Optional(
				Type.String({ description: "Branch de destino", default: "main" }),
			),
			draft: Type.Optional(
				Type.Boolean({ description: "Criar como draft PR", default: false }),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { title: string; body: string; head: string; base?: string; draft?: boolean },
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
			_ctx: unknown,
		) {
			try {
				const result = await gh.prCreate({
					title: params.title,
					body: params.body,
					head: params.head,
					base: params.base ?? "main",
					draft: params.draft,
				});

				return {
					content: [
						{
							type: "text" as const,
							text:
								`## ✅ PR criado\n\n` +
								`**#${result.number}** — [${params.title}](${result.url})\n\n` +
								`Branch: \`${params.head}\` → \`${params.base ?? "main"}\`\n` +
								`${params.draft ? "*(draft)*" : ""}`,
						},
					],
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text: `## ❌ Erro ao criar PR\n\n\`\`\`\n${msg}\n\`\`\``,
						},
					],
					isError: true,
				};
			}
		},
	};
}
