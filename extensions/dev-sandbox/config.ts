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
import type { SandboxConfig, SandboxCacheDirs } from "./types";
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
 * Resolve caminhos de cache com base no cwd.
 * Cria os diretórios se não existirem.
 */
function resolveCacheDirs(cwd: string): SandboxCacheDirs {
  const fs = require("node:fs");
  const npmDir = join(cwd, ".sandbox-cache", "npm");
  const pipDir = join(cwd, ".sandbox-cache", "pip");
  fs.mkdirSync(npmDir, { recursive: true });
  fs.mkdirSync(pipDir, { recursive: true });
  return { npm: npmDir, pip: pipDir };
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
    config = deepMerge(config, globalOverlay);
  }

  const projectOverlay = safeReadJson(projectPath);
  if (projectOverlay) {
    config = deepMerge(config, projectOverlay);
  }

  // Resolve diretórios de cache
  if (!config.filesystem.cacheDirs.npm || !config.filesystem.cacheDirs.pip) {
    const resolved = resolveCacheDirs(cwd);
    if (!config.filesystem.cacheDirs.npm) config.filesystem.cacheDirs.npm = resolved.npm;
    if (!config.filesystem.cacheDirs.pip) config.filesystem.cacheDirs.pip = resolved.pip;
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
