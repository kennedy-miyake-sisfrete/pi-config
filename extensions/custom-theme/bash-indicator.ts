/**
 * Bash Indicator — tracking !/!! + emite evento p/ borda amarela e texto.
 *
 * Híbrido (tempo real + pós-submissão):
 *
 * Tempo real (via onTerminalInput):
 *   - Rastreia buffer local keystroke a keystroke
 *   - Detecta "!" ou "!!" no início enquanto digita
 *   - Emite evento "custom:bash-mode" com { mode, text }
 *   - Best-effort: escape sequences do terminal sao ignoradas
 *
 * Pós-submissão (via user_bash):
 *   - Garante sincronia (fallback quando tracking perde sync)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { containsSudo } from "../bash/utils.ts";
import {
	createSudoAwareBashOperations,
	hasCachedPassword,
	promptForSudoPassword,
	setCachedPassword,
} from "../bash/sudo.ts";

// ---------------------------------------------------------------------------
// Display text
// ---------------------------------------------------------------------------

const DISPLAY_VISIBLE = "\uf06e bash"; // nf-fa-eye
const DISPLAY_HIDDEN = "\uf070 bash"; // nf-fa-eye-slash

// ---------------------------------------------------------------------------
// Keystroke classification
// ---------------------------------------------------------------------------

function isPrintable(data: string): boolean {
	if (data.length !== 1) return false;
	const c = data.charCodeAt(0);
	return c >= 32 && c <= 126;
}

function classify(data: string): "printable" | "backspace" | "enter" | "other" {
	if (data === "\x7f" || data === "\b") return "backspace";
	if (data === "\r" || data === "\n") return "enter";
	if (isPrintable(data)) return "printable";
	return "other"; // escape sequences do terminal nao tocam no buffer
}

function checkBuffer(buf: string): "visible" | "hidden" | null {
	if (buf.startsWith("!!")) return "hidden";
	if (buf.startsWith("!")) return "visible";
	return null;
}

function modeDisplay(mode: "visible" | "hidden"): string {
	return mode === "visible" ? DISPLAY_VISIBLE : DISPLAY_HIDDEN;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerBashIndicator(pi: ExtensionAPI) {
	let bashBuffer = "";
	let bashMode: "visible" | "hidden" | null = null;
	let inputUnsub: (() => void) | null = null;

	function emitBashMode(ctx: any, newMode: "visible" | "hidden" | null): void {
		if (newMode === bashMode) return;
		bashMode = newMode;

		pi.events.emit("custom:bash-mode", {
			mode: newMode,
			text: newMode ? modeDisplay(newMode) : null,
		});
	}

	// --- Real-time tracking ---
	pi.on("session_start", async (_event, ctx) => {
		bashBuffer = "";
		bashMode = null;
		inputUnsub?.();

		if (!ctx.hasUI) return;

		inputUnsub = ctx.ui.onTerminalInput((data: string) => {
			const kind = classify(data);

			switch (kind) {
				case "printable":
					bashBuffer += data;
					break;
				case "backspace":
					bashBuffer = bashBuffer.slice(0, -1);
					break;
				case "enter":
					bashBuffer = "";
					return { consume: false };
				case "other":
					return { consume: false };
			}

			emitBashMode(ctx, checkBuffer(bashBuffer));
			return { consume: false };
		});
	});

	pi.on("session_shutdown", async () => {
		inputUnsub?.();
		inputUnsub = null;
		bashBuffer = "";
		bashMode = null;
	});

	// --- Pós-submissão ---
	pi.on("user_bash", async (event, ctx) => {
		const newMode = event.excludeFromContext ? "hidden" : "visible";
		bashMode = newMode;
		pi.events.emit("custom:bash-mode", {
			mode: newMode,
			text: modeDisplay(newMode),
		});

		if (containsSudo(event.command) && !hasCachedPassword()) {
			if (ctx.hasUI) {
				const password = await promptForSudoPassword(ctx);
				if (password) setCachedPassword(password);
			}
		}

		return {
			operations: createWidgetAwareOps(ctx, event.command),
		};
	});

	function createWidgetAwareOps(ctx: any, command: string) {
		const baseOps = hasCachedPassword() && containsSudo(command)
			? createSudoAwareBashOperations()
			: createLocalBashOperations();

		return {
			exec: async (
				cmd: string,
				cwd: string,
				options: { onData: (d: Buffer) => void; signal?: AbortSignal; timeout?: number; env?: Record<string, string> },
			) => {
				try {
					return await baseOps.exec(cmd, cwd, options);
				} finally {
					emitBashMode(ctx, null);
				}
			},
		};
	}
}
