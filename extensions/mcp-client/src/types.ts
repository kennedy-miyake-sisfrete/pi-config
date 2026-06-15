// MCP Protocol Types (based on Model Context Protocol specification)

export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export type MCPMessage = MCPRequest | MCPResponse | MCPNotification;

// Initialize
export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: Implementation;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
}

export interface ClientCapabilities {
  experimental?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
  roots?: RootsCapability;
}

export interface ServerCapabilities {
  experimental?: Record<string, unknown>;
  logging?: LoggingCapability;
  prompts?: PromptsCapability;
  resources?: ResourcesCapability;
  tools?: ToolsCapability;
}

export interface Implementation {
  name: string;
  version: string;
}

export interface RootsCapability {
  listChanged?: boolean;
}

export interface LoggingCapability {}

export interface PromptsCapability {
  listChanged?: boolean;
}

export interface ResourcesCapability {
  subscribe?: boolean;
  listChanged?: boolean;
}

export interface ToolsCapability {
  listChanged?: boolean;
}

// Tools
export interface ListToolsParams {
  cursor?: string;
}

export interface ListToolsResult {
  tools: Tool[];
  nextCursor?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolProperty>;
  required?: string[];
}

export interface ToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolProperty;
  format?: string;
}

export interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface CallToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: Resource };

// Resources
export interface ListResourcesParams {
  cursor?: string;
}

export interface ListResourcesResult {
  resources: Resource[];
  nextCursor?: string;
}

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ReadResourceParams {
  uri: string;
}

export interface ReadResourceResult {
  contents: ResourceContent[];
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface SubscribeParams {
  uri: string;
}

export interface UnsubscribeParams {
  uri: string;
}

// Prompts
export interface ListPromptsParams {
  cursor?: string;
}

export interface ListPromptsResult {
  prompts: Prompt[];
  nextCursor?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface GetPromptParams {
  name: string;
  arguments?: Record<string, string>;
}

export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: ToolContent;
}

// Logging
export interface SetLevelParams {
  level: LoggingLevel;
}

export type LoggingLevel = "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";

export interface LoggingMessageNotification {
  level: LoggingLevel;
  logger?: string;
  data: unknown;
}

// Roots
export interface ListRootsParams {}

export interface ListRootsResult {
  roots: Root[];
}

export interface Root {
  uri: string;
  name: string;
}

// Sampling
export interface CreateMessageParams {
  messages: SamplingMessage[];
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: "none" | "thisServer" | "allServers";
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface SamplingMessage {
  role: "user" | "assistant";
  content: ToolContent;
}

export interface ModelPreferences {
  hints?: ModelHint[];
  costPriority?: number;
  speedPriority?: number;
  intelligencePriority?: number;
}

export interface ModelHint {
  name?: string;
}

export interface CreateMessageResult {
  model: string;
  role: "user" | "assistant";
  content: ToolContent;
  stopReason?: "endTurn" | "stopSequence" | "maxTokens" | "cancelled";
}

// Progress
export interface ProgressNotification {
  progressToken: string | number;
  progress: number;
  total?: number;
}

// Configuration
export interface MCPServerConfig {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPExtensionConfig {
  servers: MCPServerConfig[];
  autoConnect?: boolean;
  toolPrefix?: string;
}