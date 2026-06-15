// Tool adapter: converts MCP tools to Pi tools

import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type, Static } from "typebox";
import { MCPClient, Tool } from "./client";

export interface MCPToolAdapterOptions {
  client: MCPClient;
  prefix?: string;
  pi: ExtensionAPI;
}

function mcpTypeToTypeBox(type: string, property: any): any {
  switch (type) {
    case "string":
      if (property.enum) {
        return Type.Union(property.enum.map((v: string) => Type.Literal(v)));
      }
      if (property.format === "uri") {
        return Type.String({ format: "uri", description: property.description });
      }
      return Type.String({ description: property.description });
    case "number":
    case "integer":
      return Type.Number({ description: property.description });
    case "boolean":
      return Type.Boolean({ description: property.description });
    case "array":
      return Type.Array(mcpTypeToTypeBox(property.items?.type || "string", property.items || {}), { description: property.description });
    case "object":
      if (property.properties) {
        const props: Record<string, any> = {};
        for (const [key, value] of Object.entries(property.properties)) {
          props[key] = mcpTypeToTypeBox((value as any).type || "string", value);
        }
        return Type.Object(props, { description: property.description });
      }
      return Type.Record(Type.String(), Type.Any(), { description: property.description });
    default:
      return Type.Any({ description: property.description });
  }
}

function convertMCPToolInputSchema(schema: Tool["inputSchema"]): any {
  if (!schema.properties) {
    return Type.Object({});
  }

  const props: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    props[key] = mcpTypeToTypeBox((value as any).type || "string", value);
  }

  return Type.Object(props);
}

export function createMCPToolDefinition(
  client: MCPClient,
  tool: Tool,
  prefix: string = ""
): ToolDefinition<any, any> {
  const toolName = prefix ? `${prefix}_${tool.name}` : tool.name;
  const schema = convertMCPToolInputSchema(tool.inputSchema);

  return {
    name: toolName,
    label: tool.name,
    description: `[MCP:${client.getServerConfig().name}] ${tool.description}`,
    promptSnippet: `MCP tool from ${client.getServerConfig().name}: ${tool.name}`,
    parameters: schema,
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      signal?: AbortSignal,
      _onUpdate?: any,
      _ctx?: any
    ) {
      // Check for abort
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const result = await client.callTool(tool.name, params);

      if (result.isError) {
        const errorText = result.content
          .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
          .join("\n");
        throw new Error(`MCP tool error: ${errorText}`);
      }

      // Convert MCP tool content to Pi tool result
      const textContent = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      const otherContent = result.content.filter((c) => c.type !== "text");

      return {
        content: [
          { type: "text", text: textContent || "Tool executed successfully (no text output)" },
          ...otherContent.map((c) => ({
            type: c.type === "image" ? "image" : "resource",
            ...(c.type === "image" ? { data: c.data, mimeType: c.mimeType } : { resource: c.resource }),
          })),
        ],
        details: {
          mcpServer: client.getServerConfig().name,
          mcpTool: tool.name,
          rawResult: result,
        },
      };
    },
  };
}

export function registerMCPTools(api: ExtensionAPI, client: MCPClient, prefix: string = ""): void {
  const tools = client.getTools();

  for (const tool of tools) {
    const toolDef = createMCPToolDefinition(client, tool, prefix);
    api.registerTool(toolDef);
  }
}

export async function refreshMCPTools(api: ExtensionAPI, client: MCPClient, prefix: string = ""): Promise<number> {
  try {
    const tools = await client.listTools(true);
    // Note: Pi doesn't support unregistering tools dynamically
    // Tools registered once stay for the session
    // For now, we just log the count
    console.log(`[MCP ${client.getServerConfig().name}] Discovered ${tools.length} tools`);
    return tools.length;
  } catch (e) {
    console.error(`[MCP ${client.getServerConfig().name}] Failed to refresh tools:`, e);
    return 0;
  }
}