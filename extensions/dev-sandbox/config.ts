/**
 * Carregamento e merge de configuração do dev-sandbox.
 *
 * Ordem de precedência (último sobrescreve):
 *   1. DEFAULT_CONFIG (types.ts)
 *   2. ~/.pi/agent/extensions/dev-sandbox.json (global)
 *   3. .pi/sandbox.json (projeto)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import type { SandboxConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

function safeReadJson(filePath: string): Partial<SandboxConfig> | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };

  for (const key of Object.keys(override) as (keyof T)[]) {
    const baseVal = base[key];
    const overrideVal = override[key];

    if (
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === "object" &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else if (overrideVal !== undefined) {
      (result as Record<string, unknown>)[key as string] = overrideVal;
    }
  }

  return result;
}

/**
 * Converte formato antigo (mountReadOnly) para o novo (mode).
 * Retorna uma cópia do objeto com a conversão aplicada.
 */
function normalizeSshConfig(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.mountReadOnly !== undefined && raw.mode === undefined) {
    const copy = { ...raw };
    copy.mode = raw.mountReadOnly ? "mount" : "none";
    delete copy.mountReadOnly;
    return copy;
  }
  return raw;
}

/**
 * Carrega configuração completa com merge de defaults, global e projeto.
 */
export function loadConfig(cwd: string): SandboxConfig {
  // Global
  const agentDir = getAgentDir();
  const globalPath = join(agentDir, "extensions", "dev-sandbox.json");

  // Projeto
  const projectPath = join(cwd, CONFIG_DIR_NAME, "sandbox.json");

  let config = DEFAULT_CONFIG;

  const globalOverlay = safeReadJson(globalPath);
  if (globalOverlay) {
    // Normaliza formato antigo → novo antes do merge
    if (globalOverlay.ssh) {
      (globalOverlay as Record<string, unknown>).ssh = normalizeSshConfig(
        globalOverlay.ssh as Record<string, unknown>,
      );
    }
    config = deepMerge(config, globalOverlay);
  }

  const projectOverlay = safeReadJson(projectPath);
  if (projectOverlay) {
    // Normaliza formato antigo → novo antes do merge
    if (projectOverlay.ssh) {
      (projectOverlay as Record<string, unknown>).ssh = normalizeSshConfig(
        projectOverlay.ssh as Record<string, unknown>,
      );
    }
    config = deepMerge(config, projectOverlay);
  }

  return config;
}

/**
 * Verifica se bubblewrap está instalado e acessível.
 */
export function isBwrapAvailable(): boolean {
  const paths = ["/usr/bin/bwrap", "/usr/local/bin/bwrap"];
  for (const p of paths) {
    if (existsSync(p)) return true;
  }
  // Tenta via which
  try {
    const { execSync } = require("node:child_process");
    execSync("which bwrap 2>/dev/null || command -v bwrap 2>/dev/null", { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}
