// Transport layer for MCP connections

import { EventEmitter } from "node:events";
import { spawn, ChildProcess } from "node:child_process";
import { MCPMessage, MCPRequest, MCPResponse, MCPNotification } from "./types";

export interface Transport extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: MCPMessage): Promise<void>;
  sendNotification(method: string, params?: unknown): Promise<void>;
  isConnected(): boolean;
}

export class StdioTransport extends EventEmitter implements Transport {
  private process: ChildProcess | null = null;
  private buffer = "";
  private messageId = 0;
  private pendingRequests = new Map<string | number, { resolve: (value: MCPResponse) => void; reject: (error: Error) => void }>();
  private command: string;
  private args: string[];
  private env: Record<string, string>;
  private connected = false;
  private intentionalDisconnect = false;

  constructor(command: string, args: string[] = [], env: Record<string, string> = {}) {
    super();
    this.command = command;
    this.args = args;
    this.env = { ...process.env, ...env };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.intentionalDisconnect = false;

    return new Promise((resolve, reject) => {
      this.process = spawn(this.command, this.args, {
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        // Filter out known informational messages from CodeGraph and other servers
        if (msg.includes("Attached to shared daemon") || 
            msg.includes("Starting daemon") ||
            msg.includes("Daemon started") ||
            msg.includes("Watching for file changes")) {
          console.log(`[MCP info] ${msg}`);
        } else if (msg) {
          console.error(`[MCP stderr] ${msg}`);
        }
      });

      this.process.on("error", (err) => {
        this.emit("error", err);
        if (!this.connected) reject(err);
      });

      this.process.on("close", (code) => {
        this.connected = false;
        this.emit("close", code);
        
        // If intentionally disconnected, don't reject pending requests with error
        if (this.intentionalDisconnect) {
          for (const [, { reject }] of this.pendingRequests) {
            reject(new Error("Transport disconnected"));
          }
        } else {
          // Process died unexpectedly - reject pending requests
          for (const [, { reject }] of this.pendingRequests) {
            reject(new Error(`Process closed unexpectedly with code ${code ?? "null"}`));
          }
        }
        this.pendingRequests.clear();
      });

      // Give the process time to start
      setTimeout(() => {
        this.connected = true;
        resolve();
      }, 500);
    });
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.process !== null;
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected() || !this.process?.stdin) {
      throw new Error("Transport not connected");
    }

    const data = JSON.stringify(message) + "\n";
    this.process.stdin.write(data);
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    const notification: MCPNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    await this.send(notification);
  }

  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const id = request.id ?? ++this.messageId;
      const reqWithId = { ...request, id };

      this.pendingRequests.set(id, { resolve, reject });

      this.send(reqWithId).catch(reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${request.method}`));
        }
      }, 30000);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message: MCPMessage = JSON.parse(line);
        this.handleMessage(message);
      } catch (e) {
        console.error(`[MCP] Failed to parse message: ${line}`, e);
      }
    }
  }

  private handleMessage(message: MCPMessage): void {
    if ("id" in message && "result" in message) {
      // Response
      const response = message as MCPResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new Error(`${response.error.code}: ${response.error.message}`));
        } else {
          pending.resolve(response);
        }
      }
    } else if ("method" in message && "id" in message) {
      // Request (server -> client) - not typically used but handle it
      this.emit("request", message as MCPRequest);
    } else if ("method" in message) {
      // Notification
      this.emit("notification", message as MCPNotification);
    }
  }
}

export class SSETransport extends EventEmitter implements Transport {
  private eventSource: EventSource | null = null;
  private url: string;
  private headers: Record<string, string>;
  private connected = false;
  private messageId = 0;
  private pendingRequests = new Map<string | number, { resolve: (value: MCPResponse) => void; reject: (error: Error) => void }>();

  constructor(url: string, headers: Record<string, string> = {}) {
    super();
    this.url = url;
    this.headers = headers;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    // Note: EventSource is not available in Node.js by default
    // For production, you'd use a polyfill or a proper SSE client
    // This is a simplified implementation
    throw new Error("SSE transport requires EventSource polyfill. Use stdio transport for now.");
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    throw new Error("SSE transport send not implemented");
  }

  async send(message: MCPMessage): Promise<void> {
    // SSE is typically server -> client only
    // For client -> server, you'd use HTTP POST
    throw new Error("SSE transport send not implemented");
  }
}

// Factory function
export function createTransport(config: { transport: "stdio" | "sse"; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }): Transport {
  if (config.transport === "stdio") {
    if (!config.command) {
      throw new Error("stdio transport requires command");
    }
    return new StdioTransport(config.command, config.args, config.env);
  } else if (config.transport === "sse") {
    if (!config.url) {
      throw new Error("sse transport requires url");
    }
    return new SSETransport(config.url, config.headers);
  }
  throw new Error(`Unknown transport: ${config.transport}`);
}