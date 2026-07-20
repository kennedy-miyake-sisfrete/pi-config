/**
 * Bash Extensions — pacote de extensões para o bash tool do pi.
 *
 * Extensões incluídas:
 *   • sudo   — gerencia senha sudo automaticamente
 *
 * Uso: colocar em ~/.pi/agent/extensions/bash/ e reiniciar pi.
 *       O auto-discover carrega via bash/index.ts.
 *
 * Para adicionar nova extensão bash:
 *   1. Crie um arquivo .ts neste diretório
 *   2. Importe e registre no default export abaixo
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { containsSudo } from "./utils.ts";
import {
	clearCurrentPassword,
	createSudoAwareSpawnHook,
	promptForSudoPassword,
	registerSudoCleanup,
	setCurrentPassword,
} from "./sudo.ts";

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();

	// Cria bash tool com spawnHook que gerencia sudo -A + SUDO_ASKPASS
	const bashTool = createBashTool(cwd, {
		spawnHook: createSudoAwareSpawnHook(),
	});

	// --- Override do bash tool ---
	// try/catch: se dev-sandbox já registrou um bash tool unificado,
	//            pula silenciosamente (evita conflito de nome duplicado).
	try {
		pi.registerTool({
			...bashTool,

			// Envolve o execute original para:
			// 1. Detectar sudo e pedir senha antes de executar
			// 2. Senha é pedida toda vez (sem cache)
			// 3. Senha removida após execução
			execute: async (id, params, signal, onUpdate, ctx) => {
				const hadSudo = containsSudo(params.command);

				if (hadSudo) {
					const password = await promptForSudoPassword(ctx);
					if (!password) {
						return {
							content: [{ type: "text", text: "sudo: cancelado — senha não fornecida." }],
							details: undefined,
						};
					}
					setCurrentPassword(password);
				}

				try {
					// Delega para o bash tool (spawnHook transforma sudo → sudo -A)
					return await bashTool.execute(id, params, signal, onUpdate);
				} finally {
					// Remove senha imediatamente após execução (nunca fica cacheada)
					if (hadSudo) {
						clearCurrentPassword();
					}
				}
			},
		});
	} catch (_err) {
		// Tool "bash" já registrado (ex: dev-sandbox) — bash extension opera
		// como módulo passivo. O spawnHook e utils continuam importáveis.
	}

	// --- Cleanup no fim da sessão ---
	registerSudoCleanup(pi);
}
