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
 *
 * Integração com dev-sandbox:
 *   Se dev-sandbox/ estiver presente no mesmo diretório de extensões,
 *   esta extensão NÃO registra o tool bash — delega para dev-sandbox
 *   que cria tool unificado com spawnHook (sudo) + operations (bwrap).
 *   Se dev-sandbox NÃO estiver presente, registra normalmente.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
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

	// Verifica se dev-sandbox está presente no diretório irmão
	// __dirname = ~/.pi/agent/extensions/bash/
	// extensionsDir = ~/.pi/agent/extensions/
	const extensionsDir = dirname(__dirname);
	const devSandboxDir = join(extensionsDir, "dev-sandbox");
	const devSandboxPresent = existsSync(devSandboxDir);

	if (!devSandboxPresent) {
		// --- Override do bash tool (modo standalone) ---
		pi.registerTool({
			...bashTool,

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
					return await bashTool.execute(id, params, signal, onUpdate);
				} finally {
					if (hadSudo) {
						clearCurrentPassword();
					}
				}
			},
		});
	}
	// Se dev-sandbox presente: não registra. O spawnHook e utils
	// são importados pelo dev-sandbox que cria tool unificado.

	// --- Cleanup no fim da sessão ---
	registerSudoCleanup(pi);
}
