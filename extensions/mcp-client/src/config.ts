// Configuration loader for MCP extension

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { MCPExtensionConfig, MCPServerConfig } from "./types";

const DEFAULT_CONFIG: MCPExtensionConfig = {
  servers: [],
  autoConnect: true,
  toolPrefix: "mcp",
};

let cachedConfig: MCPExtensionConfig | null = null;

export function loadMCPConfig(): MCPExtensionConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load from global settings
  const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");
  let globalConfig: Partial<MCPExtensionConfig> = {};

  try {
    const globalSettings = JSON.parse(readFileSync(globalSettingsPath, "utf-8"));
    globalConfig = globalSettings.mcp || {};
  } catch {
    // No global config or invalid JSON
  }

  // Load from project settings (if trusted)
  let projectConfig: Partial<MCPExtensionConfig> = {};
  try {
    const projectSettingsPath = join(process.cwd(), ".pi", "settings.json");
    const projectSettings = JSON.parse(readFileSync(projectSettingsPath, "utf-8"));
    projectConfig = projectSettings.mcp || {};
  } catch {
    // No project config or invalid JSON
  }

  // Merge: project overrides global
  cachedConfig = {
    ...DEFAULT_CONFIG,
    ...globalConfig,
    ...projectConfig,
    servers: [
      ...(globalConfig.servers || []),
      ...(projectConfig.servers || []),
    ],
  };

  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function validateServerConfig(config: MCPServerConfig): string[] {
  const errors: string[] = [];

  if (!config.name || !config.name.trim()) {
    errors.push("Server name is required");
  }

  if (!config.transport || !["stdio", "sse"].includes(config.transport)) {
    errors.push("Transport must be 'stdio' or 'sse'");
  }

  if (config.transport === "stdio") {
    if (!config.command || !config.command.trim()) {
      errors.push("stdio transport requires 'command'");
    }
  }

  if (config.transport === "sse") {
    if (!config.url || !config.url.trim()) {
      errors.push("sse transport requires 'url'");
    }
  }

  return errors;
}

export function getExampleConfig(): string {
  return JSON.stringify({
    mcp: {
      autoConnect: true,
      toolPrefix: "mcp",
      servers: [
        {
          name: "filesystem",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
          enabled: true,
        },
        {
          name: "github",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: "your-token" },
          enabled: true,
        },
        {
          name: "sqlite",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./data.db"],
          enabled: false,
        },
      ],
    },
  }, null, 2);
}