# Pi.dev — Custom Models

> Fonte: https://pi.dev/docs/latest/models
> Gerado em: 2026-06-16

---

## Sumário

1. [Conceito](#conceito)
2. [Minimal Example (Ollama/Local)](#1-minimal-example-ollamalocal)
3. [Full Example (Override Defaults)](#2-full-example-override-defaults)
4. [Google AI Studio (Custom Gemma)](#3-google-ai-studio-custom-gemma)
5. [Supported APIs](#4-supported-apis)
6. [Provider Configuration](#5-provider-configuration)
7. [Value Resolution (apiKey & headers)](#6-value-resolution-apikey--headers)
8. [Custom Headers](#7-custom-headers)
9. [Model Configuration](#8-model-configuration)
10. [Thinking Level Map](#9-thinking-level-map)
11. [Overriding Built-in Providers](#10-overriding-built-in-providers)
12. [Per-model Overrides (Built-ins)](#11-per-model-overrides-built-ins)
13. [Anthropic Compatibility](#12-anthropic-messages-compatibility)
14. [OpenAI Compatibility](#13-openai-compatibility)

---

## Conceito

Arquivo `~/.pi/agent/models.json` (global) ou `.pi/models.json` (project) para adicionar **custom providers e models** como Ollama, vLLM, LM Studio, proxies, OpenRouter, Vercel Gateway, etc.

**Recarrega cada vez que abre `/model`** — edite em sessão sem restart. O arquivo também é lido em startups (após trust para project-scoped).

---

## 1. Minimal Example (Ollama/Local)

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

- `apiKey` é obrigatório sintaticamente mas Ollama ignora — qualquer valor funciona.
- Para servidores que **não** suportam `developer` role ou `reasoning_effort`:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        { "id": "gpt-oss:20b", "reasoning": true }
      ]
    }
  }
}
```

---

## 2. Full Example (Override Defaults)

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        {
          "id": "llama3.1:8b",
          "name": "Llama 3.1 8B (Local)",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 32000,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

---

## 3. Google AI Studio (Custom Gemma)

```json
{
  "providers": {
    "my-google": {
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "api": "google-generative-ai",
      "apiKey": "$GEMINI_API_KEY",
      "models": [
        {
          "id": "gemma-4-31b-it",
          "name": "Gemma 4 31B",
          "input": ["text", "image"],
          "contextWindow": 262144,
          "reasoning": true
        }
      ]
    }
  }
}
```

O `baseUrl` é **obrigatório** ao adicionar custom models ao `google-generative-ai`.

---

## 4. Supported APIs

| API | Description |
|-----|-------------|
| `openai-completions` | OpenAI Chat Completions (mais compatível) |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Messages API |
| `google-generative-ai` | Google Generative AI |

`api` pode ser definida no **provider level** (default para todos) ou **model level** (override).

---

## 5. Provider Configuration

| Field | Description |
|-------|-------------|
| `baseUrl` | URL do endpoint da API |
| `api` | Tipo de API (ver acima) |
| `apiKey` | Chave de API (ver value resolution) |
| `headers` | Headers customizados (ver value resolution) |
| `authHeader` | Se `true`, adiciona `Authorization: Bearer <apiKey>` automaticamente |
| `models` | Array de configurações de modelo |
| `modelOverrides` | Overrides per-model para modelos built-in deste provider |

---

## 6. Value Resolution (apiKey & headers)

| Formato | Exemplo | Descrição |
|---------|---------|-----------|
| **Shell command** | `"!security find-generic-password -ws 'anthropic'"` | Executa comando, usa stdout. Command resolvido **no request time** |
| **Env var** | `"$MY_API_KEY"` ou `"${KEY_PREFIX}_${KEY_SUFFIX}"` | Interpola variável de ambiente |
| **Literal** | `"sk-..."` | Usa o valor diretamente |

**Escapes:**
- `$$` → `$` literal
- `$!` → `!` literal (sem executar comando)

**Atenção:** `$FOO_BAR` = variável `FOO_BAR`; `"${FOO}_BAR"` = `FOO` + `_BAR` literal.

### Comandos Shell

Commands são resolvidos em **request time**. Pi **não** aplica TTL, stale reuse ou recovery logic — cada comando tem necessidades diferentes. Para caching/fallback, envolva em script próprio.

> `/model` checks de disponibilidade usam auth presence configurada e **não** executam shell commands.

---

## 7. Custom Headers

```json
{
  "providers": {
    "custom-proxy": {
      "baseUrl": "https://proxy.example.com/v1",
      "apiKey": "$MY_API_KEY",
      "api": "anthropic-messages",
      "headers": {
        "x-portkey-api-key": "$PORTKEY_API_KEY",
        "x-secret": "!op read 'op://vault/item/secret'"
      },
      "models": [...]
    }
  }
}
```

---

## 8. Model Configuration

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `id` | **Sim** | — | Model identifier (passado à API) |
| `name` | Não | `id` | Label human-readable. Usado para matching (`--model`) e secondary detail |
| `api` | Não | provider's | Override do tipo de API para este modelo |
| `reasoning` | Não | `false` | Se suporta extended thinking |
| `thinkingLevelMap` | Não | omitted | Mapeia pi thinking levels para valores do provider (ver abaixo) |
| `input` | Não | `["text"]` | Tipos de input: `["text"]` ou `["text", "image"]` |
| `contextWindow` | Não | 128000 | Context window em tokens |
| `maxTokens` | Não | 16384 | Máximo de tokens de output |
| `cost` | Não | zeros | `{input, output, cacheRead, cacheWrite}` (por milhão de tokens) |
| `compat` | Não | provider's | Overrides de compatibilidade. Merge com provider-level |

**Nota:** `/model`, `--list-models` e footer mostram o `id`. O campo `name` é usado para matching e texto de detalhe secundário, não substitui o `id` no footer/status-bar.

---

## 9. Thinking Level Map

Mapeia os 6 pi thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) para valores específicos do provider:

| Valor no mapa | Significado |
|---------------|-------------|
| (omitido) | Level suportado, usa mapeamento default do provider |
| `string` | Level suportado, este valor é enviado ao provider |
| `null` | Level **não** suportado, escondido/saltado/clamado |

### Exemplo 1: Só off, high e max

```json
{
  "id": "deepseek-v4-pro",
  "reasoning": true,
  "thinkingLevelMap": {
    "minimal": null,
    "low": null,
    "medium": null,
    "high": "high",
    "xhigh": "max"
  }
}
```

### Exemplo 2: Thinking não pode ser desligado

```json
{
  "id": "always-thinking-model",
  "reasoning": true,
  "thinkingLevelMap": {
    "off": null
  }
}
```

> Migration: configs antigas que usavam `compat.reasoningEffortMap` devem migrar para `thinkingLevelMap` no model level.

---

## 10. Overriding Built-in Providers

### Proxy sem redefinir models

Roteia provider built-in através de proxy:

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1"
    }
  }
}
```

Built-ins mantidos; OAuth/API key continua funcionando.

### Merge de custom models

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1",
      "apiKey": "$ANTHROPIC_API_KEY",
      "api": "anthropic-messages",
      "models": [...]
    }
  }
}
```

**Merge semantics:**
- Built-in models são mantidos
- Custom models são upserted por `id` dentro do provider
- Se `id` custom == `id` built-in → **substitui** o built-in
- Se `id` custom é novo → **adicionado** alongside built-ins

---

## 11. Per-model Overrides (Built-ins)

Customiza modelos built-in específicos sem redefinir a lista completa:

```json
{
  "providers": {
    "openrouter": {
      "modelOverrides": {
        "anthropic/claude-sonnet-4": {
          "name": "Claude Sonnet 4 (Bedrock Route)",
          "compat": {
            "openRouterRouting": {
              "only": ["amazon-bedrock"]
            }
          }
        }
      }
    }
  }
}
```

**Campos suportados:** `name`, `reasoning`, `input`, `cost` (parcial), `contextWindow`, `maxTokens`, `headers`, `compat`.

**Comportamento:**
- Aplicados a modelos built-in do provider
- IDs desconhecidos são ignorados
- Pode combinar `baseUrl`/`headers` de provider com `modelOverrides`
- Override de `name` muda matching e secondary detail; footer continua mostrando `id`
- Se `models` também definido, custom models são merge **após** built-in overrides. Custom com mesmo `id` substitui.

---

## 12. Anthropic Messages Compatibility

Para providers/proxies com `api: "anthropic-messages"`:

| Field | Default | Description |
|-------|---------|-------------|
| `supportsEagerToolInputStreaming` | `true` | Se `false`, omite `tools[].eager_input_streaming` e usa legacy beta header `fine-grained-tool-streaming-2025-05-14` |
| `supportsLongCacheRetention` | `true` | Aceita `cache_control.ttl: "1h"` para retenção longa |
| `sendSessionAffinityHeaders` | auto-detected | Envia `x-session-affinity` do session id quando caching ativo |
| `supportsCacheControlOnTools` | `true` | Aceita `cache_control` markers em tool definitions |
| `forceAdaptiveThinking` | `false` | Envia `thinking.type: "adaptive"` + `output_config.effort`. Built-in adaptive models setam auto |
| `allowEmptySignature` | `false` | Replay empty thinking signatures como `signature: ""`. Real Anthropic rejeita |

### Exemplo

```json
{
  "providers": {
    "anthropic-proxy": {
      "baseUrl": "https://proxy.example.com",
      "api": "anthropic-messages",
      "apiKey": "$ANTHROPIC_PROXY_KEY",
      "compat": {
        "supportsEagerToolInputStreaming": false,
        "supportsLongCacheRetention": true,
        "forceAdaptiveThinking": true,
        "allowEmptySignature": true
      },
      "models": [
        {
          "id": "claude-opus-4-7",
          "reasoning": true,
          "input": ["text", "image"]
        }
      ]
    }
  }
}
```

---

## 13. OpenAI Compatibility

Para servidores com compatibilidade OpenAI **parcial**:

| Field | Description |
|-------|-------------|
| `supportsStore` | Provider suporta campo `store` |
| `supportsDeveloperRole` | Usa role `developer` vs `system` |
| `supportsReasoningEffort` | Suporta parâmetro `reasoning_effort` |
| `supportsUsageInStreaming` | Suporta `stream_options: { include_usage: true }` (default: `true`) |
| `maxTokensField` | Usar `max_completion_tokens` ou `max_tokens` |
| `requiresToolResultName` | Incluir `name` em tool result messages |
| `requiresAssistantAfterToolResult` | Inserir assistant message antes de user message após tool results |
| `requiresThinkingAsText` | Converter thinking blocks para plain text |
| `requiresReasoningContentOnAssistantMessages` | Incluir `reasoning_content` vazio em replayed assistant messages |
| `thinkingFormat` | `"reasoning_effort"`, `"openrouter"`, `"deepseek"`, `"together"`, `"zai"`, `"qwen"`, `"qwen-chat-template"` |
| `cacheControlFormat` | `"anthropic"` — Anthropic-style `cache_control` markers |
| `supportsStrictMode` | Incluir campo `strict` em tool definitions |
| `supportsLongCacheRetention` | Retenção longa: `prompt_cache_retention: "24h"` (OpenAI) ou `cache_control.ttl: "1h"` (anthropic format) |
| `openRouterRouting` | OpenRouter provider routing (enviado as-is) |
| `vercelGatewayRouting` | Vercel AI Gateway routing config (`only`, `order`) |

### Detalhes de thinkingFormat

| Format | Comportamento |
|--------|---------------|
| `reasoning_effort` | `reasoning: { effort }` |
| `openrouter` | `reasoning: { effort }` + OpenRouter-specific |
| `together` | `reasoning: { enabled: true }` + `reasoning_effort` quando `supportsReasoningEffort: true` |
| `deepseek` | DeepSeek thinking parameters |
| `zai` | ZAI thinking parameters |
| `qwen` | Usa `enable_thinking` top-level |
| `qwen-chat-template` | Para Qwen-compat local: `chat_template_kwargs.enable_thinking` |

### cacheControlFormat

`cacheControlFormat: "anthropic"` é para providers OpenAI-compat que expõem Anthropic-style prompt caching através de `cache_control` markers em text content e tool definitions.

### OpenRouter Routing

```json
{
  "compat": {
    "openRouterRouting": {
      "allow_fallbacks": true,
      "require_parameters": false,
      "data_collection": "deny",
      "zdr": true,
      "enforce_distillable_text": false,
      "order": ["anthropic", "amazon-bedrock", "google-vertex"],
      "only": ["anthropic", "amazon-bedrock"],
      "ignore": ["gmicloud", "friendli"],
      "quantizations": ["fp16", "bf16"],
      "sort": { "by": "price", "partition": "model" },
      "max_price": { "prompt": 10, "completion": 20 },
      "preferred_min_throughput": { "p50": 100, "p90": 50 },
      "preferred_max_latency": { "p50": 1, "p90": 3, "p99": 5 }
    }
  }
}
```

### Vercel AI Gateway Routing

```json
{
  "compat": {
    "vercelGatewayRouting": {
      "only": ["fireworks", "novita"],
      "order": ["fireworks", "novita"]
    }
  }
}
```

---

## Provider-level vs Model-level compat

Provider-level `compat` aplica defaults a **todos** os modelos daquele provider. Model-level `compat` **sobrescreve** valores do provider para aquele modelo específico. Ambos são merged (model-level vence).