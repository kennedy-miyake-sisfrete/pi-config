/**
 * Sudo password extension for pi.
 *
 * Intercepts `bash` tool calls that use `sudo`, prompts the user for the
 * password once per session, and injects it via SUDO_ASKPASS + SUDO_PW
 * environment variables. Never modifies the command string with the password.
 *
 * Funciona com:
 *   sudo apt update
 *   sudo -u user command
 *   cmd && sudo cmd
 *   cmd | sudo tee file   ← pipes preservados, sem conflito de stdin
 *
 * Segurança:
 *   - Senha cacheada em memória (Map), nunca persiste em disco
 *   - Askpass script em temp dir, removido no session_shutdown
 *   - Env var SUDO_PW visível apenas no processo filho do spawn
 *   - Nenhuma transformação no command string expõe a senha
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BashOperations, BashSpawnHook, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { containsSudo, SUDO_REPLACE_RE } from "./utils.ts";

// ---------------------------------------------------------------------------
// Password cache (em memória, escopo do módulo = escopo da extension)
// ---------------------------------------------------------------------------

const passwordCache = new Map<string, string>();
const CACHE_KEY = "default";

export function hasCachedPassword(): boolean {
	return passwordCache.has(CACHE_KEY);
}

export function getCachedPassword(): string | undefined {
	return passwordCache.get(CACHE_KEY);
}

export function setCachedPassword(password: string): void {
	passwordCache.set(CACHE_KEY, password);
}

export function clearPasswordCache(): void {
	passwordCache.delete(CACHE_KEY);
}

// ---------------------------------------------------------------------------
// Askpass script (temp file que ecoa a senha via env var)
// ---------------------------------------------------------------------------
// Funcionamento:
//   1. Extensão cria um script askpass.sh em temp dir
//   2. SUDO_ASKPASS aponta para ele, SUDO_PW contém a senha
//   3. `sudo -A` executa o script, que dá echo "$SUDO_PW"
//   4. Vantagem: não usa stdin (funciona com pipes), senha nunca no command

let _askpassPath: string | null = null;
let _tempDir: string | null = null;

export function ensureAskpassScript(): string {
	if (_askpassPath) return _askpassPath;

	_tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sudo-askpass-"));
	_askpassPath = path.join(_tempDir, "askpass.sh");
	fs.writeFileSync(_askpassPath, '#!/bin/sh\necho "$SUDO_PW"\n', "utf-8");
	fs.chmodSync(_askpassPath, 0o755);

	return _askpassPath;
}

function cleanupAskpass(): void {
	if (_tempDir) {
		try {
			fs.rmSync(_tempDir, { recursive: true, force: true });
		} catch {
			// Temp dir cleanup é best-effort
		}
		_tempDir = null;
		_askpassPath = null;
	}
}

// ---------------------------------------------------------------------------
// Spawn hook — transforma sudo → sudo -A e injeta env vars
// ---------------------------------------------------------------------------

/**
 * Cria um `BashSpawnHook` que:
 * 1. Detecta `sudo` no comando
 * 2. Se senha estiver cacheada, substitui `sudo` por `sudo -A`
 * 3. Injeta SUDO_ASKPASS e SUDO_PW no environment
 *
 * O spawnHook é chamado internamente pelo bash tool a cada execução.
 * Como ele captura a variável `passwordCache` via closure, o valor
 * SEMPRE reflete o estado atual do cache (setado antes da delegacao).
 */
export function createSudoAwareSpawnHook(): BashSpawnHook {
	return ({ command, cwd, env }) => {
		// Verificacao rapida: sem sudo ou sem cache, passa direto
		if (!containsSudo(command) || !hasCachedPassword()) {
			return { command, cwd, env };
		}

		// Substitui sudo → sudo -A (usa SUDO_ASKPASS ao inves de stdin)
		const transformed = command.replace(
			SUDO_REPLACE_RE,
			(_, sep, ws) => `${sep}${ws}sudo -A`,
		);

		return {
			command: transformed,
			cwd,
			env: {
				...env,
				SUDO_ASKPASS: ensureAskpassScript(),
				SUDO_PW: getCachedPassword()!,
			},
		};
	};
}

// ---------------------------------------------------------------------------
// Bash operations p/ user_bash (! commands)
// ---------------------------------------------------------------------------

/**
 * Cria `BashOperations` que injeta SUDO_ASKPASS + SUDO_PW no ambiente
 * antes de executar comandos sudo. Usado pelo handler `user_bash`.
 *
 * Compartilha o mesmo cache de senha e o mesmo askpass script do
 * spawnHook, entao senha ja digitada em tool_call tambem vale aqui.
 */
export function createSudoAwareBashOperations(): BashOperations {
	const local = createLocalBashOperations();

	return {
		exec: (command, cwd, options) => {
			if (!containsSudo(command) || !hasCachedPassword()) {
				return local.exec(command, cwd, options);
			}

			// Transforma sudo → sudo -A (mesmo padrao do spawnHook)
			const transformed = command.replace(
				SUDO_REPLACE_RE,
				(_, sep, ws) => `${sep}${ws}sudo -A`,
			);

			return local.exec(transformed, cwd, {
				...options,
				env: {
					...options.env,
					SUDO_ASKPASS: ensureAskpassScript(),
					SUDO_PW: getCachedPassword()!,
				},
			});
		},
	};
}

// ---------------------------------------------------------------------------
// User prompt
// ---------------------------------------------------------------------------

/**
 * Pergunta a senha sudo ao usuario via ctx.ui.input().
 * Retorna null se o usuario cancelar ou se nao houver UI.
 */
export async function promptForSudoPassword(ctx: ExtensionContext): Promise<string | null> {
	if (!ctx.hasUI) return null;

	try {
		const password = await ctx.ui.input("🔐 Senha sudo (visível ao digitar):");
		return password ?? null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Cleanup lifecycle
// ---------------------------------------------------------------------------

/**
 * Registra cleanup no session_shutdown:
 * - Limpa cache de senha
 * - Remove temp files do askpass
 */
export function registerSudoCleanup(pi: ExtensionAPI): void {
	pi.on("session_shutdown", async () => {
		clearPasswordCache();
		cleanupAskpass();
	});
}
