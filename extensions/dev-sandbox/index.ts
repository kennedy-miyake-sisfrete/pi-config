/**
 * Extensão dev-sandbox — sandbox completo via bubblewrap.
 *
 * Isola todas as tools built-in do pi (read, write, edit, bash,
 * grep, find, ls) dentro de um namespace bwrap com:
 *   - Filesystem restrito (whitelist de /usr, /bin, /lib; /sbin vazio)
 *   - Rede do host compartilhada (para LLM API, npm, git)
 *   - ~/.ssh montado read-only (git push/pull)
 *   - Cache npm/pip persistente em .sandbox-cache/
 *   - Filtro seccomp (deny-list de 20 syscalls perigosas)
 *   - HOME isolado (sem acesso ao home real)
 *
 * Complementa security-guard.ts:
 *   - security-guard = soft boundary (pattern matching, confirmação)
 *   - dev-sandbox    = hard boundary (kernel namespaces + seccomp)
 *
 * Integração com bash/:
 *   - Importa spawnHook de sudo da extensão bash/
 *   - Bash extension faz try/catch no registerTool → skip se já registrado
 *   - Dev-sandbox registra tool unificado: spawnHook (sudo) + operations (bwrap)
 *
 * Configuração:
 *   - ~/.pi/agent/extensions/dev-sandbox.json (global)
 *   - .pi/sandbox.json (projeto)
 *
 * Uso:
 *   pi                          → sandbox ativo por padrão
 *   pi --no-sandbox             → desabilita sandbox
 *   /sandbox                    → mostra status e configuração
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createFindTool,
  createLsTool,
} from "@earendil-works/pi-coding-agent";
import { loadConfig, isBwrapAvailable } from "./config";
import { initSeccomp, cleanup } from "./bwrap-executor";
import type { SandboxConfig } from "./types";
import { createBashOps } from "./tools/bash-ops";
import { createReadOps } from "./tools/read-ops";
import { createWriteOps } from "./tools/write-ops";
import { createEditOps } from "./tools/edit-ops";
import { createFindOps } from "./tools/find-ops";
import { createLsOps } from "./tools/ls-ops";
import { createGrepTool, setGrepConfig } from "./tools/grep";

// ── Importa sudo utils da extensão bash/ ─────────
import { containsSudo } from "../bash/utils.ts";
import {
  clearCurrentPassword,
  createSudoAwareSpawnHook,
  promptForSudoPassword,
  registerSudoCleanup,
  setCurrentPassword,
} from "../bash/sudo.ts";

export default function (pi: ExtensionAPI) {
  // ── Flag --no-sandbox ──────────────────────────
  pi.registerFlag("no-sandbox", {
    description: "Desabilita o sandbox de desenvolvimento",
    type: "boolean",
    default: false,
  });

  // ── Estado da sessão ───────────────────────────
  let config: SandboxConfig | null = null;
  let enabled = false;
  let localCwd = process.cwd();

  // ── session_start ──────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    localCwd = ctx.cwd;

    const noSandbox = pi.getFlag("no-sandbox") as boolean;
    if (noSandbox) {
      enabled = false;
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Sandbox desabilitado via --no-sandbox",
          "warning",
        );
      }
      return;
    }

    // Carrega config
    config = loadConfig(localCwd);

    if (!config.enabled) {
      enabled = false;
      return;
    }

    // Verifica bwrap
    if (!isBwrapAvailable()) {
      enabled = false;
      if (ctx.hasUI) {
        ctx.ui.notify(
          "bubblewrap não encontrado. Instale com: apt install bubblewrap",
          "error",
        );
      }
      return;
    }

    // Inicializa seccomp
    if (config.seccomp.enabled) {
      try {
        initSeccomp();
      } catch (err) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Falha ao inicializar seccomp: ${err instanceof Error ? err.message : err}`,
            "warning",
          );
        }
      }
    }

    enabled = true;

    // Injeta config no grep tool
    setGrepConfig(config);

    if (ctx.hasUI) {
      ctx.ui.setStatus(
        "sandbox",
        `[🔒 Sandbox ativo] ${localCwd}`,
      );
      ctx.ui.notify(
        `Sandbox inicializado.\nWorkspace: ${localCwd}\nRede: ${config.internet.enabled ? "compartilhada" : "isolada"}`,
        "info",
      );
    }
  });

  // ── Substitui todas as tools ───────────────────

  pi.registerTool({
    ...createReadTool(localCwd),
    async execute(id, params, signal, onUpdate, ctx) {
      if (!enabled || !config) {
        const fallback = createReadTool(localCwd);
        return fallback.execute(id, params, signal, onUpdate);
      }
      const tool = createReadTool(localCwd, {
        operations: createReadOps(config, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...createWriteTool(localCwd),
    async execute(id, params, signal, onUpdate, ctx) {
      if (!enabled || !config) {
        const fallback = createWriteTool(localCwd);
        return fallback.execute(id, params, signal, onUpdate);
      }
      const tool = createWriteTool(localCwd, {
        operations: createWriteOps(config, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...createEditTool(localCwd),
    async execute(id, params, signal, onUpdate, ctx) {
      if (!enabled || !config) {
        const fallback = createEditTool(localCwd);
        return fallback.execute(id, params, signal, onUpdate);
      }
      const tool = createEditTool(localCwd, {
        operations: createEditOps(config, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  // ── Bash tool unificado: sudo spawnHook + bwrap operations ──
  //
  // Combina duas personalizações ortogonais de createBashTool:
  //   spawnHook  → gerencia senha sudo (da extensão bash/)
  //   operations → roteia execução pro bwrap (dev-sandbox)
  //
  // O wrapper de execute replica a lógica de detecção de sudo
  // da extensão bash/ (pede senha antes, limpa depois).
  {
    const unifiedBashTool = createBashTool(localCwd, {
      spawnHook: createSudoAwareSpawnHook(),
      operations: undefined as any, // placeholder, será populado no execute
    });

    // try/catch defensivo: se bash extension registrou antes
    // (ex: __dirname detection falhou), skip silenciosamente.
    try {
      pi.registerTool({
        ...unifiedBashTool,
        label: "bash (sandboxed)",

        async execute(id: string, params: any, signal: any, onUpdate: any, ctx: any) {
        if (!enabled || !config) {
          // Fallback: bash com sudo spawnHook, sem bwrap
          const fallback = createBashTool(localCwd, {
            spawnHook: createSudoAwareSpawnHook(),
          });
          return fallback.execute(id, params, signal, onUpdate);
        }

        // Reconstrói tool com operations atualizadas (config populado)
        const tool = createBashTool(localCwd, {
          spawnHook: createSudoAwareSpawnHook(),
          operations: createBashOps(config, localCwd),
        });

        // Detecção de sudo (mesma lógica da extensão bash/)
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
          return await tool.execute(id, params, signal, onUpdate);
        } finally {
          if (hadSudo) {
            clearCurrentPassword();
          }
          }
        },
      });
    } catch (_err) {
      // Bash extension já registrou — skip (não deve ocorrer,
      // mas é seguro ter fallback defensivo)
    }
  }

  // ── Cleanup sudo no fim da sessão ──────────────
  registerSudoCleanup(pi);

  pi.registerTool({
    ...createFindTool(localCwd),
    async execute(id, params, signal, onUpdate, ctx) {
      if (!enabled || !config) {
        const fallback = createFindTool(localCwd);
        return fallback.execute(id, params, signal, onUpdate);
      }
      const tool = createFindTool(localCwd, {
        operations: createFindOps(config, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...createLsTool(localCwd),
    async execute(id, params, signal, onUpdate, ctx) {
      if (!enabled || !config) {
        const fallback = createLsTool(localCwd);
        return fallback.execute(id, params, signal, onUpdate);
      }
      const tool = createLsTool(localCwd, {
        operations: createLsOps(config, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...createGrepTool(localCwd),
    async execute(id, params, signal, onUpdate) {
      const tool = createGrepTool(localCwd);
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  // ── user_bash (!comando e !!comando) ──────────
  pi.on("user_bash", (_event) => {
    if (!enabled || !config) return;
    return { operations: createBashOps(config, localCwd) };
  });

  // ── before_agent_start ────────────────────────
  pi.on("before_agent_start", (_event) => {
    if (!enabled || !config) return;
    const sandboxNote = [
      `Current working directory: ${localCwd}`,
      "(sandboxed — bubblewrap namespaces + seccomp)",
    ].join(" ");
    return { systemPrompt: sandboxNote };
  });

  // ── /sandbox command ──────────────────────────
  pi.registerCommand("sandbox", {
    description: "Mostra status e configuração do sandbox",
    handler: async (_args, ctx) => {
      if (!enabled || !config) {
        ctx.ui.notify(
          "Sandbox desabilitado.\nUse '--no-sandbox' para desabilitar ou verifique a instalação do bubblewrap.",
          "info",
        );
        return;
      }

      const lines = [
        `🔒 Sandbox de Desenvolvimento`,
        ``,
        `Status: ativo`,
        `Workspace: ${localCwd}`,
        `Rede: ${config.internet.enabled ? "compartilhada com host" : "isolada"}`,
        `Seccomp: ${config.seccomp.enabled ? "ativo (20 syscalls bloqueadas)" : "desabilitado"}`,
        `SSH: ${config.ssh.mountReadOnly ? "~/.ssh montado read-only" : "não montado"}`,
        `Cache npm: ${config.filesystem.cacheDirs.npm || "não configurado"}`,
        `Cache pip: ${config.filesystem.cacheDirs.pip || "não configurado"}`,
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── session_shutdown ──────────────────────────
  pi.on("session_shutdown", () => {
    cleanup();
    enabled = false;
    config = null;
  });
}
