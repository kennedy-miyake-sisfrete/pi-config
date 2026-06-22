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
	clearPasswordCache,
	createSudoAwareSpawnHook,
	hasCachedPassword,
	promptForSudoPassword,
	registerSudoCleanup,
	setCachedPassword,
} from "./sudo.ts";

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();

	// Cria bash tool com spawnHook que gerencia sudo -A + SUDO_ASKPASS
	const bashTool = createBashTool(cwd, {
		spawnHook: createSudoAwareSpawnHook(),
	});

	// --- Override do bash tool ---
	pi.registerTool({
		...bashTool,

		// Envolve o execute original para:
		// 1. Detectar sudo e pedir senha antes de executar
		// 2. Senha cacheada dura a sessão toda
		//    Se errou a senha, use /sudo-clear pra resetar
		execute: async (id, params, signal, onUpdate, ctx) => {
			const hadSudo = containsSudo(params.command);

			if (hadSudo && !hasCachedPassword()) {
				const password = await promptForSudoPassword(ctx);
				if (!password) {
					return {
						content: [{ type: "text", text: "sudo: cancelado — senha não fornecida. Use /sudo-clear pra reiniciar." }],
						details: undefined,
					};
				}
				setCachedPassword(password);
			}

			// Delega para o bash tool (spawnHook transforma sudo → sudo -A)
			return bashTool.execute(id, params, signal, onUpdate);
		},
	});

	// --- Comando para limpar senha cacheada ---
	pi.registerCommand("sudo-clear", {
		description: "Limpa a senha sudo cacheada (força nova digitação na próxima execução)",
		handler: async (_args, ctx) => {
			clearPasswordCache();
			ctx.ui.notify("Senha sudo removida do cache.", "info");
		},
	});

	// --- Cleanup no fim da sessão ---
	registerSudoCleanup(pi);
}
