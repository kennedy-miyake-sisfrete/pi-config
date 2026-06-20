/**
 * Slash Icons — adiciona nerd-font icons nos slash commands do autocomplete.
 *
 * Intercepta o provider built-in de /comandos e prefixa cada label
 * com um ícone nerd-font correspondente ao comando.
 *
 * Registrado em session_start via ctx.ui.addAutocompleteProvider().
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Mapa de ícones nerd-font por comando
const ICON_MAP: Record<string, string> = {
	"/model":      "\uf0e7",  // nf-fa-bolt           — troca de modelo
	"/settings":   "\uf013",  // nf-fa-gear            — configuracoes
	"/new":        "\uf055",  // nf-fa-plus-circle     — nova sessao
	"/clear":      "\uf014",  // nf-fa-trash-o         — limpar sessao
	"/help":       "\uf059",  // nf-fa-question-circle — ajuda
	"/compact":    "\uf187",  // nf-fa-archive         — compactar
	"/tree":       "\uf1bb",  // nf-fa-tree            — arvore
	"/fork":       "\uf126",  // nf-fa-code-fork       — bifurcar
	"/resume":     "\uf04b",  // nf-fa-play            — continuar
	"/export":     "\uf019",  // nf-fa-download        — exportar
	"/sudo-clear": "\uf023",  // nf-fa-lock            — senha sudo
};

const DEFAULT_ICON = "\uf120"; // nf-fa-terminal

function getIcon(command: string): string {
	return ICON_MAP[command] ?? DEFAULT_ICON;
}

export function registerSlashIcons(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["/"],
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const result = await current.getSuggestions(lines, cursorLine, cursorCol, options);
				if (!result) return null;

				return {
					...result,
					items: result.items.map((item) => ({
						...item,
						label: `${getIcon(item.value)} ${item.label}`,
					})),
				};
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},
		}));
	});
}
