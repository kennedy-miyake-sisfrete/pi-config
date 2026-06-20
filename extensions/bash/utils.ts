/**
 * Shared utilities for bash-related extensions.
 *
 * This module provides common functions used by multiple bash extensions
 * (sudo detection, command analysis, etc.).
 */

/**
 * Regex que detecta `sudo` como comando (início da linha ou após separadores shell).
 *
 * Casos que match:
 *   sudo apt update
 *   apt update && sudo apt upgrade
 *   apt update || sudo apt upgrade
 *   apt update; sudo apt upgrade
 *   cmd | sudo tee file
 *   cmd & sudo cmd
 *
 * Casos que NÃO match (falso positivo improvável):
 *   echo "sudo"        → sudo dentro de aspas (mas sem whitespace após, não match)
 *   sudoers            → \b word boundary evita
 *   ./sudo-helper      → \b word boundary evita
 */
export const SUDO_RE = /(?:^|\n|\|\||&&|;|&|\|)\s*sudo\b/;

/**
 * Regex para substituição de `sudo` preservando separadores e whitespace.
 * Grupos: $1 = separador, $2 = whitespace
 */
export const SUDO_REPLACE_RE = /(^|\n|\|\||&&|;|&|\|)(\s*)sudo\b/g;

/**
 * Retorna true se o comando contém `sudo` como palavra-chave de comando.
 */
export function containsSudo(command: string): boolean {
	return SUDO_RE.test(command);
}
