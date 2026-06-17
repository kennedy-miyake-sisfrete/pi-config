# Pi.dev — Custom Providers

> Fonte: https://pi.dev/docs/latest/custom-provider
> Gerado em: 2026-06-16

---

## Sumário

1. [Conceito](#conceito)
2. [Quick Reference](#1-quick-reference)
3. [Override Existing Provider](#2-override-existing-provider)
4. [Register New Provider](#3-register-new-provider)
5. [Unregister Provider](#4-unregister-provider)
6. [API Types](#5-api-types)
7. [Auth Header](#6-auth-header)
8. [OAuth Support](#7-oauth-support)
9. [Custom Streaming API (streamSimple)](#8-custom-streaming-api-streamsimple)
10. [Context Overflow Errors](#9-context-overflow-errors)
11. [Testing](#10-testing)
12. [Config Reference](#11-config-reference)
13. [Model Definition Reference](#12-model-definition-reference)

---

## Conceito

Extensions podem registrar **custom model providers** via `pi.registerProvider()`, permitindo:

- **Proxies** — Roteamento via corporate proxies ou API gateways
- **Custom endpoints** — Deployments self-hosted ou privados
- **OAuth/SSO** — Fluxos de autenticação enterprise
- **Custom APIs** — Implementação de streaming para APIs LLM não-padrão

**Exemplos completos:** `examples/extensions/custom-provider-anthropic/` e `custom-provider-gitlab-duo/`.

---

## 1. Quick Reference

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Override baseUrl de provider existente
  pi.registerProvider("anthropic", {
    baseUrl: "https://proxy.example.com"
  });

  // Registrar novo provider com modelos
  pi.registerProvider("my-provider", {
    name: "My Provider",
    baseUrl: "https://api.example.com",
    apiKey: "$MY_API_KEY",
    api: "openai-completions",
    models: [{
      id: "my-model",
      name: "My Model",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096
    }]
  });
}
```

> Factory pode ser **async** — útil para **dynamic model discovery** (fetch + register). Pi aguarda a factory antes de continuar o startup, então o provider fica disponível em startup interativo e para `pi --list-models`.

---

## 2. Override Existing Provider

Override simples: redirecionar provider existente através de proxy.

```typescript
// Proxy Anthropic
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// Custom headers no OpenAI
pi.registerProvider("openai", {
  headers: {
    "X-Custom-Header": "value"
  }
});

// Ambos (baseUrl + headers)
pi.registerProvider("google", {
  baseUrl: "https://ai-gateway.corp.com/google",
  headers: {
    "X-Corp-Auth": "$CORP_AUTH_TOKEN"
  }
});
```

**Regra:** Quando **apenas** `baseUrl` e/ou `headers` são fornecidos (sem `models`), **todos os modelos built-in daquele provider são preservados** com o novo endpoint.

---

## 3. Register New Provider

### Registro Estático

```typescript
pi.registerProvider("my-llm", {
  baseUrl: "https://api.my-llm.com/v1",
  apiKey: "$MY_LLM_API_KEY",       // env var reference
  api: "openai-completions",        // streaming API
  models: [{
    id: "my-llm-large",
    name: "My LLM Large",
    reasoning: true,                 // extended thinking
    input: ["text", "image"],
    cost: {
      input: 3.0,                    // $/million tokens
      output: 15.0,
      cacheRead: 0.3,
      cacheWrite: 3.75
    },
    contextWindow: 200000,
    maxTokens: 16384
  }]
});
```

> Quando `models` é fornecido, **substitui** todos os modelos existentes daquele provider.

### Registro Dinâmico (Async Factory)

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://localhost:1234/v1/models");
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      name?: string;
      context_window?: number;
      max_tokens?: number;
    }>;
  };

  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: payload.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.context_window ?? 128000,
      maxTokens: model.max_tokens ?? 4096,
    })),
  });
}
```

**Value resolution** (apiKey, headers): mesmas regras de `models.json`:
- `!command` → executa comando, usa stdout
- `$ENV_VAR` / `${ENV_VAR}` → interpola env var
- `$$` → `$` literal
- `$!` → `!` literal

---

## 4. Unregister Provider

```typescript
pi.unregisterProvider("my-llm");
```

Remove todos os itens registrados:
- Dynamic models
- API key fallback
- OAuth provider registration
- Custom stream handler registrations

**Built-ins que foram sobrescritos são restaurados.** Chamadas após a fase inicial de load da extension são aplicadas imediatamente — sem `/reload`.

---

## 5. API Types

O campo `api` determina qual implementação de streaming será usada:

| API | Para usar com |
|-----|---------------|
| `anthropic-messages` | Anthropic Claude API e compatíveis |
| `openai-completions` | OpenAI Chat Completions API e compatíveis (**mais usado**) |
| `openai-responses` | OpenAI Responses API |
| `azure-openai-responses` | Azure OpenAI Responses API |
| `openai-codex-responses` | OpenAI Codex Responses API |
| `mistral-conversations` | Mistral SDK Conversations/Chat streaming |
| `google-generative-ai` | Google Generative AI API |
| `google-vertex` | Google Vertex AI API |
| `bedrock-converse-stream` | Amazon Bedrock Converse API |

**Migration note:** Mistral migrou de `openai-completions` para `mistral-conversations`. Se forçar rota via `openai-completions`, set compat explicitamente.

### Quirks de OpenAI-compat via model-level

```typescript
models: [{
  id: "custom-model",
  reasoning: true,
  thinkingLevelMap: {
    minimal: null,
    low: null,
    medium: null,
    high: "default",
    xhigh: "max"
  },
  compat: {
    supportsDeveloperRole: false,     // usa "system" em vez de "developer"
    supportsReasoningEffort: true,
    maxTokensField: "max_tokens",     // em vez de "max_completion_tokens"
    requiresToolResultName: true,
    thinkingFormat: "qwen",          // enable_thinking: true top-level
    cacheControlFormat: "anthropic"   // Anthropic-style cache_control
  }
}]
```

**thinkingFormat:**
- `openrouter`: `reasoning: { effort }`
- `together`: `reasoning: { enabled }` + `reasoning_effort` se `supportsReasoningEffort`
- `qwen`: top-level `enable_thinking`
- `qwen-chat-template`: Qwen local lê `chat_template_kwargs.enable_thinking`

**cacheControlFormat: "anthropic"**: aplica Anthropic-style `cache_control` markers no system prompt, last tool definition e last user/assistant text content (para providers OpenAI-compat que expõem prompt caching).

**anthropic-messages compat:**
- `forceAdaptiveThinking: true` → `thinking.type: "adaptive"` + `output_config.effort`
- `allowEmptySignature: true` → replay `signature: ""` (só se provider emite empty signatures)

---

## 6. Auth Header

Se o provider espera `Authorization: Bearer <key>` mas não usa API standard:

```typescript
pi.registerProvider("custom-api", {
  baseUrl: "https://api.example.com",
  apiKey: "$MY_API_KEY",
  authHeader: true,      // adiciona Authorization: Bearer header
  api: "openai-completions",
  models: [...]
});
```

---

## 7. OAuth Support

Adiciona autenticação OAuth/SSO integrada com `/login`:

```typescript
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";

pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com/v1",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      const method = await callbacks.onSelect({
        message: "Select login method:",
        options: [
          { id: "browser", label: "Browser OAuth" },
          { id: "device", label: "Device code" }
        ]
      });
      if (!method) throw new Error("Login cancelled");

      let code: string;
      if (method === "device") {
        callbacks.onDeviceCode({
          userCode: "ABCD-1234",
          verificationUri: "https://sso.corp.com/device",
          intervalSeconds: 5,
          expiresInSeconds: 900
        });
        code = await pollDeviceCodeUntilComplete();
      } else {
        callbacks.onAuth({ url: "https://sso.corp.com/authorize?..." });
        code = await callbacks.onPrompt({ message: "Enter SSO code:" });
      }

      const tokens = await exchangeCodeForTokens(code);
      return {
        refresh: tokens.refreshToken,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      const tokens = await refreshAccessToken(credentials.refresh);
      return {
        refresh: tokens.refreshToken ?? credentials.refresh,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },

    // Optional: modificar modelos baseado na subscription do user
    modifyModels(models, credentials) {
      const region = decodeRegionFromToken(credentials.access);
      return models.map(m => ({
        ...m,
        baseUrl: `https://${region}.ai.corp.com/v1`
      }));
    }
  }
});
```

### OAuthLoginCallbacks

```typescript
interface OAuthLoginCallbacks {
  onAuth(params: { url: string }): void;
  onDeviceCode(params: {
    userCode: string;
    verificationUri: string;
    intervalSeconds?: number;
    expiresInSeconds?: number;
  }): void;
  onPrompt(params: { message: string }): Promise<string>;
  onSelect(params: {
    message: string;
    options: { id: string; label: string }[];
  }): Promise<string | undefined>;
}
```

### OAuthCredentials

Persistido em `~/.pi/agent/auth.json`:

```typescript
interface OAuthCredentials {
  refresh: string;    // Refresh token (para refreshToken())
  access: string;     // Access token (retornado por getApiKey())
  expires: number;    // Timestamp de expiração em milliseconds
}
```

---

## 8. Custom Streaming API (streamSimple)

Para providers com APIs não-padrão. **Estude as referências antes:** `anthropic.ts`, `mistral.ts`, `openai-completions.ts`, `openai-responses.ts`, `google.ts`, `amazon-bedrock.ts`.

### Stream Pattern

```typescript
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  calculateCost,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";

function streamMyProvider(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0, output: 0,
        cacheRead: 0, cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    try {
      // Push start
      stream.push({ type: "start", partial: output });

      // Process API request, push content events...

      // Push done
      stream.push({
        type: "done",
        reason: output.stopReason as "stop" | "length" | "toolUse",
        message: output
      });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}
```

### Event Types (ordem estrita)

```typescript
{ type: "start", partial: output }

// Content events (repeatable, track contentIndex)
{ type: "text_start", contentIndex, partial }       // Text block started
{ type: "text_delta", contentIndex, delta, partial }     // Text chunk
{ type: "text_end", contentIndex, content, partial }     // Text block ended
{ type: "thinking_start", contentIndex, partial }        // Thinking started
{ type: "thinking_delta", contentIndex, delta, partial }   // Thinking chunk
{ type: "thinking_end", contentIndex, content, partial }  // Thinking ended
{ type: "toolcall_start", contentIndex, partial }        // Tool call started
{ type: "toolcall_delta", contentIndex, delta, partial }  // Tool call JSON chunk
{ type: "toolcall_end", contentIndex, toolCall, partial } // Tool call ended

{ type: "done", reason, message }   // ou
{ type: "error", reason, error }
```

### Content Blocks

```typescript
// Iniciar block de texto
output.content.push({ type: "text", text: "" });
stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });

// Adicionar chunk
const block = output.content[contentIndex];
if (block.type === "text") {
  block.text += delta;
  stream.push({ type: "text_delta", contentIndex, delta, partial: output });
}

// Finalizar
stream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
```

### Tool Calls

```typescript
// Iniciar
output.content.push({
  type: "toolCall",
  id: toolCallId,
  name: toolName,
  arguments: {}
});
stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });

// Acumular JSON
let partialJson = "";
partialJson += jsonDelta;
try { block.arguments = JSON.parse(partialJson); } catch {}
stream.push({ type: "toolcall_delta", contentIndex, delta: jsonDelta, partial: output });

// Finalizar
stream.push({
  type: "toolcall_end",
  contentIndex,
  toolCall: { type: "toolCall", id, name, arguments: block.arguments },
  partial: output
});
```

### Usage & Cost

```typescript
output.usage.input = response.usage.input_tokens;
output.usage.output = response.usage.output_tokens;
output.usage.cacheRead = response.usage.cache_read_tokens ?? 0;
output.usage.cacheWrite = response.usage.cache_write_tokens ?? 0;
output.usage.totalTokens = output.usage.input + output.usage.output +
                           output.usage.cacheRead + output.usage.cacheWrite;
calculateCost(model, output.usage);
```

### Registration do Stream

```typescript
pi.registerProvider("my-provider", {
  baseUrl: "https://api.example.com",
  apiKey: "$MY_API_KEY",
  api: "my-custom-api",
  models: [...],
  streamSimple: streamMyProvider
});
```

---

## 9. Context Overflow Errors

Pi pode fazer **auto-recovery** de context overflow: compacta a conversa e retenta. Só funciona se reconhecer o erro.

**Detection padrão:**
- `stopReason === "error"`
- `errorMessage` corresponde a padrões conhecidos de overflow

**Se provider retorna overflow não reconhecido:** normalize via `message_end` handler na mesma extension:

```typescript
const MY_PROVIDER_OVERFLOW_PATTERN = /your provider's overflow phrase/i;

export default function (pi: ExtensionAPI) {
  pi.registerProvider("my-provider", { /* ... */ });

  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (message.provider !== "my-provider" && ctx.model?.provider !== "my-provider") return;

    const errorMessage = message.errorMessage ?? "";
    if (errorMessage.includes("context_length_exceeded")) return;
    if (!MY_PROVIDER_OVERFLOW_PATTERN.test(errorMessage)) return;

    return {
      message: {
        ...message,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });
}
```

**Guards importantes:**
- Scope ao seu provider (`message.provider`, `ctx.model?.provider`)
- Match **provider-specific pattern**, não genérico
- Skip se já tem `context_length_exceeded` → idempotent
- **Não** reescreva rate-limit ou throttling errors → quebraria o retry-with-backoff nativo do pi

---

## 10. Testing

Teste seu provider contra as mesmas suites dos built-ins (copie e adapte de `packages/ai/test/`):

| Teste | Propósito |
|-------|-----------|
| `stream.test.ts` | Streaming básico, output de texto |
| `tokens.test.ts` | Token counting e usage |
| `abort.test.ts` | AbortSignal handling |
| `empty.test.ts` | Respostas vazias/mínimas |
| `context-overflow.test.ts` | Limites de context window |
| `image-limits.test.ts` | Input de imagem |
| `unicode-surrogate.test.ts` | Casos de borda Unicode |
| `tool-call-without-result.test.ts` | Casos de borda de tool call |
| `image-tool-result.test.ts` | Imagens em tool results |
| `total-tokens.test.ts` | Cálculo de total tokens |
| `cross-provider-handoff.test.ts` | Handoff de contexto entre providers |

---

## 11. Config Reference

```typescript
interface ProviderConfig {
  /** Display name do provider na UI (ex: /login). */
  name?: string;

  /** URL do endpoint da API. Required quando definindo models. */
  baseUrl?: string;

  /** API key: literal, $ENV_VAR, ${ENV_VAR}, ou !command. Required quando definindo models (exceto com oauth). */
  apiKey?: string;

  /** Tipo de API para streaming. Required no provider ou model level. */
  api?: Api;

  /** Implementação custom de streaming para APIs não-padrão. */
  streamSimple?: (
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions
  ) => AssistantMessageEventStream;

  /** Headers custom. Mesma sintaxe de value resolution do apiKey. */
  headers?: Record<string, string>;

  /** Se true, adiciona Authorization: Bearer. */
  authHeader?: boolean;

  /** Modelos a registrar. Se fornecido, substitui todos os models existentes. */
  models?: ProviderModelConfig[];

  /** Provider OAuth para /login. */
  oauth?: {
    name: string;
    login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
    refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
    getApiKey(credentials: OAuthCredentials): string;
    modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[];
  };
}
```

---

## 12. Model Definition Reference

```typescript
interface ProviderModelConfig {
  /** Model ID (ex: "claude-sonnet-4-20250514"). */
  id: string;

  /** Display name (ex: "Claude 4 Sonnet"). */
  name: string;

  /** Override de API type para este modelo. */
  api?: Api;

  /** Override de baseUrl para este modelo. */
  baseUrl?: string;

  /** Se suporta extended thinking. */
  reasoning: boolean;

  /** Mapeia pi thinking levels para valores do provider; null marca nível não suportado. */
  thinkingLevelMap?: Partial<Record<
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
    string | null
  >>;

  /** Tipos de input suportados. */
  input: ("text" | "image")[];

  /** Custo por milhão de tokens. */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };

  /** Context window máxima em tokens. */
  contextWindow: number;

  /** Máximo de tokens de output. */
  maxTokens: number;

  /** Headers custom para este modelo. */
  headers?: Record<string, string>;

  /** Configurações de compatibilidade para a API selecionada. */
  compat?: {
    // --- openai-completions / openai-responses ---
    supportsStore?: boolean;
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    supportsUsageInStreaming?: boolean;
    maxTokensField?: "max_completion_tokens" | "max_tokens";
    requiresToolResultName?: boolean;
    requiresAssistantAfterToolResult?: boolean;
    requiresThinkingAsText?: boolean;
    requiresReasoningContentOnAssistantMessages?: boolean;
    thinkingFormat?: "openai" | "openrouter" | "deepseek" | "together"
                    | "zai" | "qwen" | "qwen-chat-template";
    cacheControlFormat?: "anthropic";

    // --- anthropic-messages ---
    supportsEagerToolInputStreaming?: boolean;
    supportsLongCacheRetention?: boolean;
    sendSessionAffinityHeaders?: boolean;
    supportsCacheControlOnTools?: boolean;
    forceAdaptiveThinking?: boolean;
    allowEmptySignature?: boolean;
  };
}
```

**Compat details:**

| compat field | API | Descrição |
|--------------|-----|-----------|
| `supportsDeveloperRole` | openai | Usar `developer` vs `system` role |
| `maxTokensField` | openai | `max_completion_tokens` (o1) vs `max_tokens` |
| `thinkingFormat` | openai | `openrouter` → `reasoning: { effort }`; `deepseek` → `thinking: { type }`; `together` → `reasoning: { enabled }`; `qwen` → `enable_thinking` top-level |
| `cacheControlFormat` | openai | `"anthropic"` → Anthropic-style cache_control markers |
| `forceAdaptiveThinking` | anthropic | `thinking.type: "adaptive"` + `output_config.effort` |
| `allowEmptySignature` | anthropic | Replay empty signatures como `signature: ""` |
| `supportsEagerToolInputStreaming` | anthropic | Se false, omite e usa legacy beta header |