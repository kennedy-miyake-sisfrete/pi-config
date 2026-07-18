/**
 * Agent Type Switcher — alterna entre CODER, PLANNER e WRITER.
 *
 * Cada tipo de agente tem:
 *   • AGENTS.md próprio (injetado no system prompt)
 *   • Conjunto de tools específico
 *
 * Uso:
 *   /agent              → menu interativo para selecionar tipo
 *   /agent coder        → muda para CODER diretamente
 *   /agent planner      → muda para PLANNER diretamente
 *   /agent writer       → muda para WRITER diretamente
 *
 * Integração:
 *   Emite "custom:agent-switch" para o status-bar.ts atualizar o badge.
 *   Persiste estado em session entries (customType: "agent-switcher").
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { agentConfig as coderConfig } from "./coder.ts";
import { agentConfig as plannerConfig } from "./planner.ts";
import { agentConfig as writerConfig } from "./writer.ts";

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface AgentConfig {
	type: "coder" | "planner" | "writer";
	label: string;
	/** null = mantém tools padrão do pi. string[] = restringe a este conjunto. */
	activeTools: string[] | null;
	agentsMd: string;
	/**
	 * Opcional: restringe tools de escrita a extensões de arquivo específicas.
	 * Chave = nome da tool, valor = extensões permitidas (ex.: [".md"]).
	 * Tools não listadas aqui operam sem restrição.
	 */
	allowedExtensions?: Record<string, string[]>;
}

// ── Configs dos 3 tipos ─────────────────────────────────────────────────────

const agents: Record<string, AgentConfig> = {
	coder: coderConfig,
	planner: plannerConfig,
	writer: writerConfig,
};
let currentType: AgentConfig["type"] = "coder";
let toolsBeforeSwitch: string[] | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getActiveToolsForType(config: AgentConfig): string[] | null {
	if (config.activeTools === null) return null; // keep pi defaults
	return config.activeTools;
}

function applyTools(pi: ExtensionAPI, config: AgentConfig): void {
	const tools = getActiveToolsForType(config);
	if (tools === null) {
		// Restore tools that were active before first switch
		if (toolsBeforeSwitch !== null) {
			pi.setActiveTools(toolsBeforeSwitch);
			toolsBeforeSwitch = null;
		}
		return;
	}
	// Save current tools on first restriction
	if (toolsBeforeSwitch === null) {
		toolsBeforeSwitch = pi.getActiveTools();
	}
	// Merge: keep non-managed tools + our allowed set
	const existing = pi.getActiveTools();
	const managedSet = new Set([
		"read", "bash", "edit", "write", "grep", "find", "ls",
		"codegraph_codegraph_search", "codegraph_codegraph_context",
		"codegraph_codegraph_node", "codegraph_codegraph_explore",
		"codegraph_codegraph_trace", "mcp", "web_search", "web_agent", "web_fetch",
	]);
	const merged = [
		...tools,
		...existing.filter((t) => !managedSet.has(t)),
	];
	pi.setActiveTools([...new Set(merged)]);
}

function injectAgentsMd(systemPrompt: string, config: AgentConfig): string {
	return `${systemPrompt}\n\n${config.agentsMd}`;
}

function getBlockedReason(config: AgentConfig, toolName: string, args: Record<string, unknown>): string | null {
	const restrictions = config.allowedExtensions;
	if (!restrictions) return null;

	const allowedExts = restrictions[toolName];
	if (!allowedExts) return null; // tool not restricted

	// Check all file path arguments
	const filePaths: string[] = [];
	if (typeof args.path === "string") filePaths.push(args.path);
	if (typeof args.filePath === "string") filePaths.push(args.filePath);
	if (typeof args.file === "string") filePaths.push(args.file);

	// write tool sends content + path differently, check all string args ending in extension
	for (const [key, val] of Object.entries(args)) {
		if (typeof val === "string" && (val.includes("/") || val.includes("."))) {
			const ext = val.slice(val.lastIndexOf("."));
			if (ext.includes("/") || ext.includes(" ")) continue;
			if (ext.length >= 2 && ext.length <= 6 && !ext.includes(" ")) {
				filePaths.push(val);
			}
		}
	}

	for (const fp of filePaths) {
		const ext = fp.slice(fp.lastIndexOf("."));
		if (!allowedExts.includes(ext)) {
			return `\"${toolName}\" restrito a arquivos ${allowedExts.join(", ")} no modo ${config.label}. Alvo: ${fp}`;
		}
	}

	return null;
}

// ── Comando /agent ──────────────────────────────────────────────────────────

async function handleAgentCommand(args: string, pi: ExtensionAPI, ctx: ExtensionContext) {
	const arg = args?.trim().toLowerCase();

	if (arg && ["coder", "planner", "writer"].includes(arg)) {
		switchTo(arg as AgentConfig["type"], pi, ctx);
		return;
	}

	// Interactive selection
	const options = Object.values(agents).map((cfg) => {
		const isCurrent = cfg.type === currentType;
		const prefix = isCurrent ? "● " : "  ";
		const desc = cfg === agents.coder
			? "Desenvolvimento de código"
			: cfg === agents.planner
				? "Planejamento e arquitetura"
				: "Criação e revisão de texto";
		return `${prefix}${cfg.label} — ${desc}`;
	});

	const choice = await ctx.ui.select(
		`Agente atual: ${agents[currentType]?.label ?? "CODER"}\nSelecione o tipo de agente:`,
		options,
	);

	if (!choice) return;

	const selected = Object.values(agents).find((cfg) => choice.includes(cfg.label));
	if (selected && selected.type !== currentType) {
		switchTo(selected.type, pi, ctx);
	}
}

function switchTo(type: AgentConfig["type"], pi: ExtensionAPI, ctx?: ExtensionContext) {
	const config = agents[type];
	if (!config || config.type === currentType) return;

	currentType = type;
	applyTools(pi, config);

	// Persist state
	pi.appendEntry("agent-switcher", { agent: type });

	// Notify status-bar badge
	pi.events?.emit("custom:agent-switch", { type });

	if (ctx) {
		ctx.ui.notify(`Modo alterado para: ${config.label}`, "info");
	}
}

// ── Extension entry ─────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── Block restricted file operations ─────────────────────────────
	pi.on("tool_call", async (event, ctx) => {
		const config = agents[currentType];
		if (!config) return;

		const reason = getBlockedReason(config, event.toolName, event.input as Record<string, unknown>);
		if (reason) {
			return { block: true, reason };
		}
	});

	// ── Register command ───────────────────────────────────────────────
	pi.registerCommand("agent", {
		description: "Alternar tipo de agente: coder, planner, writer",
		getArgumentCompletions: (prefix: string) => {
			const n = prefix.trim().toLowerCase();
			return Object.values(agents)
				.filter((cfg) => cfg.type.startsWith(n))
				.map((cfg) => ({ value: cfg.type, label: cfg.label }));
		},
		handler: async (args, ctx) => handleAgentCommand(args, pi, ctx),
	});

	// ── Restore state on session start ─────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();

		// Find last persisted state
		const stateEntry = entries
			.filter((e: { type: string; customType?: string }) =>
				e.type === "custom" && e.customType === "agent-switcher",
			)
			.pop() as { data?: { agent?: string } } | undefined;

		const savedType = stateEntry?.data?.agent;
		if (savedType && ["coder", "planner", "writer"].includes(savedType) && savedType !== currentType) {
			currentType = savedType as AgentConfig["type"];
		}

		// Apply tools for current type
		const config = agents[currentType];
		if (config) {
			applyTools(pi, config);
			// Emit for status bar
			pi.events?.emit("custom:agent-switch", { type: currentType });
		}
	});

	// ── Inject AGENTS.md into system prompt ────────────────────────────
	pi.on("before_agent_start", async (event) => {
		const config = agents[currentType];
		if (!config) return;

		return {
			systemPrompt: injectAgentsMd(event.systemPrompt, config),
		};
	});
}
