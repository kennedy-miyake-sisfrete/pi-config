// MCP Client implementation

import { Transport, createTransport, StdioTransport } from "./transport";
import {
  MCPRequest,
  MCPResponse,
  MCPNotification,
  InitializeParams,
  InitializeResult,
  ListToolsResult,
  Tool,
  CallToolParams,
  CallToolResult,
  ListResourcesResult,
  Resource,
  ReadResourceParams,
  ReadResourceResult,
  ListPromptsResult,
  Prompt,
  GetPromptParams,
  GetPromptResult,
  SetLevelParams,
  ListRootsResult,
  Root,
  CreateMessageParams,
  CreateMessageResult,
  MCPServerConfig,
  MCPError,
} from "./types";

export interface MCPClientOptions {
  serverConfig: MCPServerConfig;
  onNotification?: (notification: MCPNotification) => void;
  onRequest?: (request: MCPRequest) => Promise<MCPResponse>;
}

export class MCPClient {
  private transport: Transport;
  private serverConfig: MCPServerConfig;
  private initialized = false;
  private serverCapabilities: InitializeResult["capabilities"] | null = null;
  private serverInfo: InitializeResult["serverInfo"] | null = null;
  private tools: Tool[] = [];
  private resources: Resource[] = [];
  private prompts: Prompt[] = [];
  private onNotification?: (notification: MCPNotification) => void;
  private onRequest?: (request: MCPRequest) => Promise<MCPResponse>;
  private requestId = 0;

  constructor(options: MCPClientOptions) {
    this.serverConfig = options.serverConfig;
    this.onNotification = options.onNotification;
    this.onRequest = options.onRequest;
    this.transport = createTransport(this.serverConfig);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.transport.on("notification", (notification: MCPNotification) => {
      this.handleNotification(notification);
    });

    this.transport.on("request", async (request: MCPRequest) => {
      if (this.onRequest) {
        try {
          const response = await this.onRequest(request);
          await this.transport.send(response);
        } catch (e) {
          console.error("[MCP] Error handling request:", e);
        }
      }
    });

    this.transport.on("error", (err: Error) => {
      console.error(`[MCP ${this.serverConfig.name}] Transport error:`, err);
      this.initialized = false;
    });

    this.transport.on("close", (code: number) => {
      console.log(`[MCP ${this.serverConfig.name}] Connection closed with code ${code}`);
      this.initialized = false;
    });
  }

  private handleNotification(notification: MCPNotification): void {
    if (this.onNotification) {
      this.onNotification(notification);
    }

    // Handle specific notifications
    switch (notification.method) {
      case "notifications/tools/list_changed":
        this.tools = [];
        break;
      case "notifications/resources/list_changed":
        this.resources = [];
        break;
      case "notifications/prompts/list_changed":
        this.prompts = [];
        break;
      case "notifications/message":
        // Progress or logging notifications
        break;
    }
  }

  private nextRequestId(): string | number {
    return ++this.requestId;
  }

  private async sendRequest(method: string, params?: unknown): Promise<MCPResponse> {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: this.nextRequestId(),
      method,
      params,
    };
    return this.transport.sendRequest(request);
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    await this.transport.sendNotification(method, params);
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    await this.initialize();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.initialized = false;
    this.tools = [];
    this.resources = [];
    this.prompts = [];
  }

  async initialize(): Promise<InitializeResult> {
    const params: InitializeParams = {
      protocolVersion: "2024-11-05",
      capabilities: {
        experimental: {},
        sampling: {},
        roots: { listChanged: true },
      },
      clientInfo: {
        name: "pi-mcp-client",
        version: "1.0.0",
      },
    };

    const response = await this.sendRequest("initialize", params);
    if (response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    const result = response.result as InitializeResult;
    this.serverCapabilities = result.capabilities;
    this.serverInfo = result.serverInfo;
    this.initialized = true;

    // Send initialized notification (no response expected)
    await this.sendNotification("notifications/initialized", {});

    return result;
  }

  // Tools
  async listTools(forceRefresh = false): Promise<Tool[]> {
    if (this.tools.length > 0 && !forceRefresh) {
      return this.tools;
    }

    const response = await this.sendRequest("tools/list", {});
    if (response.error) {
      throw new Error(`List tools failed: ${response.error.message}`);
    }

    const result = response.result as ListToolsResult;
    this.tools = result.tools;
    return this.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown> = {}): Promise<CallToolResult> {
    const params: CallToolParams = { name, arguments: arguments_ };
    const response = await this.sendRequest("tools/call", params);
    if (response.error) {
      throw new Error(`Call tool failed: ${response.error.message}`);
    }
    return response.result as CallToolResult;
  }

  // Resources
  async listResources(forceRefresh = false): Promise<Resource[]> {
    if (this.resources.length > 0 && !forceRefresh) {
      return this.resources;
    }

    const response = await this.sendRequest("resources/list", {});
    if (response.error) {
      throw new Error(`List resources failed: ${response.error.message}`);
    }

    const result = response.result as ListResourcesResult;
    this.resources = result.resources;
    return this.resources;
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    const params: ReadResourceParams = { uri };
    const response = await this.sendRequest("resources/read", params);
    if (response.error) {
      throw new Error(`Read resource failed: ${response.error.message}`);
    }
    return response.result as ReadResourceResult;
  }

  async subscribeResource(uri: string): Promise<void> {
    const response = await this.sendRequest("resources/subscribe", { uri });
    if (response.error) {
      throw new Error(`Subscribe resource failed: ${response.error.message}`);
    }
  }

  async unsubscribeResource(uri: string): Promise<void> {
    const response = await this.sendRequest("resources/unsubscribe", { uri });
    if (response.error) {
      throw new Error(`Unsubscribe resource failed: ${response.error.message}`);
    }
  }

  // Prompts
  async listPrompts(forceRefresh = false): Promise<Prompt[]> {
    if (this.prompts.length > 0 && !forceRefresh) {
      return this.prompts;
    }

    const response = await this.sendRequest("prompts/list", {});
    if (response.error) {
      throw new Error(`List prompts failed: ${response.error.message}`);
    }

    const result = response.result as ListPromptsResult;
    this.prompts = result.prompts;
    return this.prompts;
  }

  async getPrompt(name: string, arguments_: Record<string, string> = {}): Promise<GetPromptResult> {
    const params: GetPromptParams = { name, arguments: arguments_ };
    const response = await this.sendRequest("prompts/get", params);
    if (response.error) {
      throw new Error(`Get prompt failed: ${response.error.message}`);
    }
    return response.result as GetPromptResult;
  }

  // Logging
  async setLogLevel(level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency"): Promise<void> {
    const params: SetLevelParams = { level };
    const response = await this.sendRequest("logging/setLevel", params);
    if (response.error) {
      throw new Error(`Set log level failed: ${response.error.message}`);
    }
  }

  // Roots
  async listRoots(): Promise<Root[]> {
    const response = await this.sendRequest("roots/list", {});
    if (response.error) {
      throw new Error(`List roots failed: ${response.error.message}`);
    }
    const result = response.result as ListRootsResult;
    return result.roots;
  }

  // Sampling (for server to request completions from client)
  async createMessage(params: CreateMessageParams): Promise<CreateMessageResult> {
    const response = await this.sendRequest("sampling/createMessage", params);
    if (response.error) {
      throw new Error(`Create message failed: ${response.error.message}`);
    }
    return response.result as CreateMessageResult;
  }

  // Getters
  isInitialized(): boolean {
    return this.initialized;
  }

  getServerConfig(): MCPServerConfig {
    return this.serverConfig;
  }

  getServerCapabilities() {
    return this.serverCapabilities;
  }

  getServerInfo() {
    return this.serverInfo;
  }

  getTools(): Tool[] {
    return this.tools;
  }

  getResources(): Resource[] {
    return this.resources;
  }

  getPrompts(): Prompt[] {
    return this.prompts;
  }

  getTransport(): Transport {
    return this.transport;
  }
}

// Client manager for multiple servers
export class MCPClientManager {
  private clients = new Map<string, MCPClient>();
  private globalNotificationHandler?: (clientName: string, notification: MCPNotification) => void;

  setGlobalNotificationHandler(handler: (clientName: string, notification: MCPNotification) => void): void {
    this.globalNotificationHandler = handler;
  }

  async addServer(config: MCPServerConfig): Promise<MCPClient> {
    if (this.clients.has(config.name)) {
      throw new Error(`Server ${config.name} already exists`);
    }

    const client = new MCPClient({
      serverConfig: config,
      onNotification: (notification) => {
        this.globalNotificationHandler?.(config.name, notification);
      },
    });

    this.clients.set(config.name, client);

    if (config.enabled !== false) {
      await client.connect();
    }

    return client;
  }

  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }

  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  getAllClients(): MCPClient[] {
    return Array.from(this.clients.values());
  }

  getConnectedClients(): MCPClient[] {
    return Array.from(this.clients.values()).filter((c) => c.isInitialized());
  }

  async connectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      if (!client.isInitialized()) {
        try {
          await client.connect();
        } catch (e) {
          console.error(`[MCP] Failed to connect to ${client.getServerConfig().name}:`, e);
        }
      }
    }
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
  }
}