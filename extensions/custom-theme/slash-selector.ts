/**
 * Slash Selector — overlay customizado para navegar /comandos.
 *
 * Trigger: Ctrl+/
 * Keyboard: ↑↓ Enter Esc Ctrl+C Ctrl+D Ctrl+G para sair
 * Filtro por substring no nome do comando
 * Janela deslizante com MAX_VISIBLE items visiveis
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, string> = {
	"/model":        "\uf0e7",  // nf-fa-bolt
	"/settings":     "\uf013",  // nf-fa-gear
	"/new":          "\uf055",  // nf-fa-plus-circle
	"/compact":      "\uf187",  // nf-fa-archive
	"/tree":         "\uf1bb",  // nf-fa-tree
	"/fork":         "\uf126",  // nf-fa-code-fork
	"/clone":        "\uf0c5",  // nf-fa-copy
	"/resume":       "\uf04b",  // nf-fa-play
	"/export":       "\uf019",  // nf-fa-download
	"/reload":       "\uf021",  // nf-fa-refresh
	"/name":         "\uf040",  // nf-fa-pencil
	"/session":      "\uf0ca",  // nf-fa-list
	"/copy":         "\uf0c5",  // nf-fa-copy
	"/share":        "\uf064",  // nf-fa-share
	"/hotkeys":      "\uf11c",  // nf-fa-keyboard-o
	"/changelog":    "\uf0f6",  // nf-fa-file-text
	"/login":        "\uf090",  // nf-fa-sign-in
	"/scoped-models":"\uf0e7",  // nf-fa-bolt
	"/trust":        "\uf023",  // nf-fa-lock
	"/quit":         "\uf011",  // nf-fa-power-off
	"/sudo-clear":   "\uf023",  // nf-fa-lock
};
const DEFAULT_ICON = "\uf120"; // nf-fa-terminal

function getIcon(name: string): string {
	return ICON_MAP[name] ?? DEFAULT_ICON;
}

// ---------------------------------------------------------------------------
// Built-in commands
// ---------------------------------------------------------------------------

const BUILTIN: { value: string; description: string }[] = [
	{ value: "/model", description: "Switch model" },
	{ value: "/settings", description: "Open settings" },
	{ value: "/new", description: "New session" },
	{ value: "/resume", description: "Resume session" },
	{ value: "/compact", description: "Compact context" },
	{ value: "/tree", description: "Session tree" },
	{ value: "/fork", description: "Fork session" },
	{ value: "/clone", description: "Clone branch" },
	{ value: "/export", description: "Export to HTML" },
	{ value: "/reload", description: "Reload extensions, skills, prompts" },
	{ value: "/name", description: "Set session name" },
	{ value: "/session", description: "Show session info" },
	{ value: "/copy", description: "Copy last assistant message" },
	{ value: "/share", description: "Upload as private Gist" },
	{ value: "/hotkeys", description: "Show keyboard shortcuts" },
	{ value: "/changelog", description: "Display version history" },
	{ value: "/login", description: "OAuth login" },
	{ value: "/scoped-models", description: "Enable/disable models for cycling" },
	{ value: "/trust", description: "Save project trust decision" },
	{ value: "/quit", description: "Quit pi" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlashItem {
	value: string; // "/model"
	description?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 12;


export class SlashSelector implements Component {
	private filter = "";
	private idx = 0;
	private items: SlashItem[];
	private filtered: SlashItem[];
	private done: (value: string | null) => void;
	private t: Theme;
	private tui: TUI;

	constructor(items: SlashItem[], t: Theme, tui: TUI, done: (value: string | null) => void) {
		this.items = items;
		this.t = t;
		this.tui = tui;
		this.done = done;
		this.filtered = items;
	}

	handleInput(data: string): void {
		// Arrow Up
		if (matchesKey(data, "up")) {
			if (this.filtered.length === 0) return;
			this.idx = Math.max(0, this.idx - 1);
			this.tui.requestRender();
			return;
		}
		// Arrow Down
		if (matchesKey(data, "down")) {
			if (this.filtered.length === 0) return;
			this.idx = Math.min(this.filtered.length - 1, this.idx + 1);
			this.tui.requestRender();
			return;
		}
		// Enter
		if (matchesKey(data, "enter") || matchesKey(data, "return")) {
			if (this.filtered.length > 0 && this.idx < this.filtered.length) {
				this.done(this.filtered[this.idx].value);
			}
			return;
		}
		// Cancel (Esc, Ctrl+C, Ctrl+D, Ctrl+G)
		if (
			matchesKey(data, "escape") ||
			matchesKey(data, "ctrl+c") ||
			matchesKey(data, "ctrl+d") ||
			matchesKey(data, "ctrl+g")
		) {
			this.done(null);
			return;
		}
		// Backspace
		if (matchesKey(data, "backspace")) {
			if (this.filter.length > 0) {
				this.filter = this.filter.slice(0, -1);
				this.applyFilter();
				this.tui.requestRender();
			}
			return;
		}
		// Printable ASCII
		if (data.length === 1) {
			const c = data.charCodeAt(0);
			if (c >= 32 && c <= 126) {
				this.filter += data;
				this.applyFilter();
				this.tui.requestRender();
			}
			return;
		}
	}

	private applyFilter(): void {
		const f = this.filter.toLowerCase();
		this.filtered = f
			? this.items.filter((it) => it.value.toLowerCase().includes(f))
			: [...this.items];
		if (this.idx >= this.filtered.length) {
			this.idx = Math.max(0, this.filtered.length - 1);
		}
	}

	render(width: number): string[] {
		const t = this.t;
		const innerW = Math.max(1, width - 2);
		const lines: string[] = [];

		// Color helpers
		const A = (text: string) => t.fg("accent", text);
		const M = (text: string) => t.fg("muted", text);
		// Preenche com espacos ate innerW; corta se ultrapassar
		const fill = (text: string) => {
			const w = visibleWidth(text);
			if (w > innerW) return truncateToWidth(text, innerW, "");
			if (w < innerW) return text + " ".repeat(innerW - w);
			return text;
		};
		const bar = (text: string) => A("\u2502") + text + A("\u2502");
		// Linha com fundo de selecao (fill + bg dentro do bar)
		const selBar = (text: string) => bar(A(t.bg("selectedBg", fill(text))));

		// Box top
		lines.push(A(`\u250c${"\u2500".repeat(innerW)}\u2510`));

		// Header: /<filtro>  N
		const filterStyled = A(this.filter || " ");
		const headerLeft = ` ${A("/")}${filterStyled}`;
		const headerRight = A(`${this.filtered.length}`);
		const headerPad = " ".repeat(Math.max(0, innerW - visibleWidth(headerLeft) - visibleWidth(headerRight)));
		lines.push(bar(fill(`${headerLeft}${headerPad}${headerRight}`)));

		// Divider
		lines.push(A(`\u251c${"\u2500".repeat(innerW)}\u2524`));

		// Items
		if (this.filtered.length === 0) {
			lines.push(bar(fill(A("  No matching commands"))));
		} else {
			// Scrolling window centered on selected index
			let start = this.idx - Math.floor(MAX_VISIBLE / 2);
			start = Math.max(0, Math.min(start, this.filtered.length - MAX_VISIBLE));

			for (let i = 0; i < MAX_VISIBLE && start + i < this.filtered.length; i++) {
				const item = this.filtered[start + i];
				const isSel = (start + i) === this.idx;
				const icon = getIcon(item.value);
				const nameStr = ` ${icon} ${item.value}`;

				if (isSel) {
					// —— Linha do comando (selecionado): fundo selectedBg + ▶ ——
					lines.push(selBar(`\u25b8${nameStr}`));
					// —— Linha de descricao (se houver) ——
					if (item.description) {
						lines.push(selBar(M(`  ${item.description}`)));
					}
				} else {
					// Nao selecionado: sem fundo, espaco duplo no lugar da seta
					lines.push(bar(fill(A(`  ${nameStr}`))));
				}
			}
		}

		// Bottom border
		lines.push(A(`\u2514${"\u2500".repeat(innerW)}\u2518`));

		return lines;
	}

	invalidate(): void {
		this.tui.requestRender();
	}
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerSlashSelector(pi: ExtensionAPI): void {
	pi.registerShortcut("ctrl+/", {
		description: "Selecionar slash command",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;

			const commands = pi.getCommands();
			const extItems: SlashItem[] = commands.map((cmd) => ({
				value: cmd.name.startsWith("/") ? cmd.name : `/${cmd.name}`,
				description: cmd.description,
			}));
			// Deduplica: built-in primeiro, extItems sobrescreve se mesmo nome
			const seen = new Set<string>();
			const items: SlashItem[] = [];
			for (const item of [
				...BUILTIN,
				...extItems,
			]) {
				if (!seen.has(item.value)) {
					seen.add(item.value);
					items.push(item);
				}
			}

			if (items.length === 0) return;

			const result = await ctx.ui.custom<string | null>(
				(tui, theme, _kb, done) => new SlashSelector(items, theme, tui, done),
				{
					overlay: true,
					overlayOptions: {
						width: "60%",
						minWidth: 40,
						maxHeight: "50%",
						anchor: "center",
					},
				},
			);

			if (result) {
				ctx.ui.pasteToEditor(result);
			}
		},
	});
}
