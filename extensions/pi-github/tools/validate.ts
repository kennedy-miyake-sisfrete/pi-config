/**
 * Validação e construção de títulos seguindo Conventional Commits.
 *
 * Formato:
 *   <type>(<scope>)[!]: <description> [#<task-number>]
 *
 * Exemplos:
 *   feat(auth): Adiciona login com JWT #123
 *   fix(api)!: Remove campo obsoleto #456
 *   refactor(checkout): Extrai validação de cupom
 */

export const VALID_TYPES = [
	"feat",
	"fix",
	"refactor",
	"docs",
	"style",
	"test",
	"chore",
	"ci",
	"build",
	"perf",
	"revert",
] as const;

export type CommitType = (typeof VALID_TYPES)[number];

// Regex completo: type(scope)!: description #123
const CC_REGEX =
	/^(feat|fix|refactor|docs|style|test|chore|ci|build|perf|revert)\([a-z0-9_\-./]+\)(!)?: .+( #\d+)?$/i;

/**
 * Constrói o título completo a partir dos campos estruturados.
 */
export function buildTitle(opts: {
	type: CommitType;
	scope: string;
	title: string;
	breaking?: boolean;
	taskNumber?: string | number;
}): string {
	const scope = opts.scope || "sem-scope";
	const breaking = opts.breaking ? "!" : "";
	const task = opts.taskNumber != null ? ` #${opts.taskNumber}` : "";
	return `${opts.type}(${scope})${breaking}: ${opts.title}${task}`;
}

/**
 * Valida se o título completo segue o formato Conventional Commits.
 */
export function validateTitle(title: string): {
	valid: boolean;
	error?: string;
} {
	if (!CC_REGEX.test(title)) {
		return {
			valid: false,
			error: [
				`Título não segue Conventional Commits:`,
				`  Recebido: "${title}"`,
				`  Esperado: "tipo(escopo)[!]: descrição [#numero]"`,
				'',
				`  Tipos: ${VALID_TYPES.join(", ")}`,
				`  Escopo: módulo (ex: auth, api/orders, docker)`,
				`  !: opcional, para breaking changes`,
				`  #numero: opcional, número da tarefa`,
			].join("\n"),
		};
	}
	return { valid: true };
}
