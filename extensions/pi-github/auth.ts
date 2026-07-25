/**
 * Verificação de disponibilidade e autenticação do gh CLI.
 *
 * Usa execSync do Node apenas para checagem inicial (durante carregamento
 * da extensão). Tools em runtime usam pi.exec() via gh.ts.
 */

import { execSync } from "node:child_process";
import type { AuthInfo } from "./types";

/**
 * Verifica se gh CLI está instalado e autenticado.
 * Chamada síncrona durante inicialização da extensão.
 */
export function getAuthInfo(): AuthInfo {
	const info: AuthInfo = {
		available: false,
		authenticated: false,
		user: "",
	};

	// gh CLI instalado?
	try {
		execSync("gh --version", { stdio: "ignore" });
		info.available = true;
	} catch {
		return info;
	}

	// Autenticado?
	try {
		const out = execSync("gh auth status 2>&1", {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		info.authenticated = true;
		const userMatch = out.match(/as\s+(\S+)/);
		if (userMatch) info.user = userMatch[1];
	} catch {
		// Não autenticado — info.authenticated já é false
	}

	return info;
}

const ENV_VARS = ["GH_TOKEN", "GITHUB_TOKEN"] as const;

/**
 * Retorna token de ambiente (GH_TOKEN ou GITHUB_TOKEN), se definido.
 * gh CLI usa estas variáveis automaticamente.
 */
export function getEnvToken(): string | null {
	for (const v of ENV_VARS) {
		if (process.env[v]) return process.env[v]!;
	}
	return null;
}
