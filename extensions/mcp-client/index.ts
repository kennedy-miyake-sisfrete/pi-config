import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { MCPClientManager } from "./src/client";
import { registerMCPTools, refreshMCPTools } from "./src/tool-adapter";
import { loadMCPConfig, clearConfigCache, getExampleConfig, validateServerConfig } from "./src/config";

type MCPConnection = {
  client: MCPClientManager;
  connectedServers: string[];
};

let connection: MCPConnection | null = null;
let isConnecting = false;

function getConnection(): MCPConnection {
  if (!connection) {
    connection = { client: new MCPClientManager(), connectedServers: [] };
  }
  return connection;
}

async function disconnectAllInternal(): Promise<void> {
  if (connection) {
    await connection.client.disconnectAll();
    connection = null;
  }
}

async function connectServers(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  ui: ExtensionContext["ui"]
): Promise<{ success: number; failed: number }> {
  if (isConnecting) {
    return { success: 0, failed: 0 };
  }
  isConnecting = true;

  try {
    const config = loadMCPConfig();
    const mgr = getConnection().client;

    if (config.servers.length === 0) {
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    for (const serverConfig of config.servers) {
      if (serverConfig.enabled === false) continue;

      const errors = validateServerConfig(serverConfig);
      if (errors.length > 0) {
        console.error(`[MCP] Invalid config for ${serverConfig.name}: ${errors.join(", ")}`);
        failed++;
        continue;
      }

      try {
        const client = await mgr.addServer(serverConfig);
        const tools = client.getTools();
        registerMCPTools(pi, client, config.toolPrefix);
        success++;

        if (ui?.notify && ctx?.mode === "tui") {
          ui.notify(`MCP connected: ${serverConfig.name} (${tools.length} tools)`, "info");
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[MCP] Failed to connect ${serverConfig.name}: ${errMsg}`);
        failed++;
      }
    }

    return { success, failed };
  } finally {
    isConnecting = false;
  }
}

async function addServerAndConnect(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  rawArg: string
): Promise<string> {
  try {
    const serverConfig = JSON.parse(rawArg);
    const errors = validateServerConfig(serverConfig);
    if (errors.length > 0) {
      return `Invalid server config: ${errors.join(", ")}`;
    }

    const mgr = getConnection().client;
    const config = loadMCPConfig();

    if (mgr.getClient(serverConfig.name)) {
      return `Server "${serverConfig.name}" already connected. Disconnect first.`;
    }

    const client = await mgr.addServer(serverConfig);
    const tools = client.getTools();
    registerMCPTools(pi, client, config.toolPrefix);
    ctx.ui.notify(`MCP connected: ${serverConfig.name} (${tools.length} tools)`, "info");
    return `Connected to ${serverConfig.name} with ${tools.length} tools`;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return `Failed: ${errMsg}`;
  }
}

async function listServers(ctx: ExtensionCommandContext): Promise<string> {
  const mgr = getConnection().client;
  const allClients = mgr.getAllClients();
  const connectedClients = mgr.getConnectedClients();

  let output = `Servers: ${allClients.length} total, ${connectedClients.length} connected\n\n`;

  for (const client of allClients) {
    const cfg = client.getServerConfig();
    const status = client.isInitialized() ? "CONNECTED" : "DISCONNECTED";
    const info = client.getServerInfo();
    const tools = client.getTools();
    output += `  ${status}  ${cfg.name} (${cfg.transport})\n`;
    if (info) {
      output += `         ${info.name} v${info.version}\n`;
    }
    if (tools.length > 0) {
      output += `         ${tools.length} tools: ${tools.map(t => t.name).join(", ")}\n`;
    }
    output += "\n";
  }

  return output;
}

async function disconnectServer(ctx: ExtensionCommandContext, name: string): Promise<string> {
  const mgr = getConnection().client;
  const client = mgr.getClient(name);
  if (!client) {
    return `Server "${name}" not found`;
  }
  await mgr.removeServer(name);
  ctx.ui.notify(`MCP disconnected: ${name}`, "info");
  return `Disconnected from ${name}`;
}

async function refreshTools(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<string> {
  const mgr = getConnection().client;
  const config = loadMCPConfig();
  const connected = mgr.getConnectedClients();
  let total = 0;

  for (const client of connected) {
    const count = await refreshMCPTools(pi, client, config.toolPrefix);
    total += count;
  }

  return `Refreshed ${connected.length} servers, ${total} tools`;
}

async function reconnectAll(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<string> {
  await disconnectAllInternal();
  const result = await connectServers(pi, ctx, ctx.ui);
  ctx.ui.notify("All MCP servers disconnected", "info");
  return `Reconnected: ${result.success} ok, ${result.failed} failed`;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event: any, ctx: ExtensionContext) => {
    const config = loadMCPConfig();
    if (!config.autoConnect) return;
    if (config.servers.length === 0) return;

    if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;

    // Handle reload: clean up existing connection first
    if (event.reason === "reload") {
      await disconnectAllInternal();
    }

    setTimeout(async () => {
      try {
        const result = await connectServers(pi, ctx, ctx.ui);
        if (result.success > 0 && ctx.mode === "tui") {
          ctx.ui.notify(`MCP: ${result.success} server(s) connected`, "info");
        }
      } catch (e) {
        console.error("[MCP] Auto-connect error:", e);
      }
    }, 1000);
  });

  pi.on("session_shutdown", async () => {
    await disconnectAllInternal();
  });

  pi.registerCommand("mcp", {
    description: "Manage MCP servers: /mcp (list), /mcp connect <json>, /mcp disconnect <name>, /mcp reconnect, /mcp refresh",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = args.trim();

      if (!trimmed) {
        const output = await listServers(ctx);
        ctx.ui.editor?.(output);
        return;
      }

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();

      switch (cmd) {
        case "connect": {
          const jsonArg = parts.slice(1).join(" ");
          if (!jsonArg) {
            ctx.ui.notify("Usage: /mcp connect <JSON config>", "error");
            return;
          }
          const result = await addServerAndConnect(pi, ctx, jsonArg);
          ctx.ui.notify(result, result.startsWith("Failed") ? "error" : "info");
          break;
        }
        case "disconnect": {
          const name = parts.slice(1).join(" ");
          if (!name) {
            ctx.ui.notify("Usage: /mcp disconnect <name>", "error");
            return;
          }
          const result = await disconnectServer(ctx, name);
          ctx.ui.notify(result, "info");
          break;
        }
        case "reconnect": {
          const result = await reconnectAll(pi, ctx);
          ctx.ui.notify(result, "info");
          break;
        }
        case "refresh": {
          const result = await refreshTools(pi, ctx);
          ctx.ui.notify(result, "info");
          break;
        }
        case "example": {
          ctx.ui.editor?.(getExampleConfig());
          break;
        }
        default: {
          ctx.ui.notify(`Unknown command: ${cmd}. Use: list, connect, disconnect, reconnect, refresh, example`, "error");
        }
      }
    },
  });
}