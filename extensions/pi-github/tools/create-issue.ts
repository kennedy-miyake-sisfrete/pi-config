/**
 * Tool: github_create_issue
 *
 * Cria issue no GitHub.
 * LLM usa para reportar bugs, sugerir features, etc.
 */

import { Type } from "typebox";
import type { GhApi } from "../gh";

export function createIssueTool(gh: GhApi) {
	return {
		name: "github_create_issue",
		label: "GitHub: Create Issue",
		description:
			"Cria uma issue no GitHub. Use para reportar bugs, sugerir melhorias, " +
			"ou registrar tarefas. Parâmetros: title (título), body (descrição), " +
			"labels (array de labels), assignees (array de logins para atribuir).",

		parameters: Type.Object({
			title: Type.String({ description: "Título da issue" }),
			body: Type.String({ description: "Descrição da issue (markdown)" }),
			labels: Type.Optional(
				Type.Array(Type.String(), { description: "Labels para aplicar" }),
			),
			assignees: Type.Optional(
				Type.Array(Type.String(), { description: "Usuários para atribuir (login)" }),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { title: string; body: string; labels?: string[]; assignees?: string[] },
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
			_ctx: unknown,
		) {
			try {
				const result = await gh.issueCreate({
					title: params.title,
					body: params.body,
					labels: params.labels,
					assignees: params.assignees,
				});

				const parts: string[] = [
					`## ✅ Issue criada\n`,
					`**#${result.number}** — [${params.title}](${result.url})`,
				];
				if (params.labels?.length) {
					parts.push(`\nLabels: ${params.labels.join(", ")}`);
				}
				if (params.assignees?.length) {
					parts.push(`Assignees: ${params.assignees.join(", ")}`);
				}

				return { content: [{ type: "text" as const, text: parts.join("\n") }] };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text: `## ❌ Erro ao criar issue\n\n\`\`\`\n${msg}\n\`\`\``,
						},
					],
					isError: true,
				};
			}
		},
	};
}
