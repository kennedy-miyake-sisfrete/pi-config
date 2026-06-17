# Pi.dev — Análise Completa de Customizações (Extensions)

> Fonte: https://pi.dev/docs/latest/extensions
> Gerado em: 2026-06-16

---

## Sumário

1. [Eventos de Ciclo de Vida](#1-eventos-de-ciclo-de-vida)
2. [ExtensionContext](#2-extensioncontext)
3. [ExtensionCommandContext](#3-extensioncommandcontext)
4. [ExtensionAPI Methods](#4-extensionapi-methods-pi)
5. [Custom Tools](#5-custom-tools)
6. [Custom UI](#6-custom-ui)
7. [Message Rendering & Themes](#7-message-rendering--themes)
8. [State Management](#8-state-management)
9. [Locais de Extensão & Estilos](#9-locais-de-extensão--estilos)
10. [Mode Behavior](#10-mode-behavior)
11. [Importações Disponíveis](#11-importações-disponíveis)
12. [Exemplos de Referência](#12-exemplos-de-referência)
13. [Considerações de Shutdown](#13-considerações-de-shutdown)
14. [Provider Customizado](#14-provider-customizado)

---

## 1. Eventos de Ciclo de Vida

### Lifecycle Overview

```
pi starts
  │
  ├─► project_trust (user/global e CLI extensions, antes de carregar recursos do projeto)
  ├─► session_start { reason: "startup" }
  └─► resources_discover { reason: "startup" }
      │
      ▼
user sends prompt ─────────────────────────────────────────┐
  │                                                        │
  ├─► (extension commands checked first, bypass if found)  │
  ├─► input (pode interceptar, transformar, ou handled)    │
  ├─► (skill/template expansion if not handled)             │
  ├─► before_agent_start (inject message, modify system prompt)
  ├─► agent_start                                          │
  ├─► message_start / message_update / message_end         │
  │                                                        │
  │   ┌─── turn (repeats while LLM calls tools) ───┐       │
  │   │                                            │       │
  │   ├─► turn_start                               │       │
  │   ├─► context (modify messages)                │       │
  │   ├─► before_provider_request (inspect/replace payload)
  │   ├─► after_provider_response (status + headers)
  │   │                                            │       │
  │   │   LLM responds, may call tools:            │       │
  │   │     ├─► tool_execution_start               │       │
  │   │     ├─► tool_call (can block, mutate input)│       │
  │   │     ├─► tool_execution_update              │       │
  │   │     ├─► tool_result (can modify result)    │       │
  │   │     └─► tool_execution_end                 │       │
  │   │                                            │       │
  │   └─► turn_end                                 │       │
  │                                                        │
  └─► agent_end                                            │
                                                           │
user sends another prompt ◄────────────────────────────────┘

/new ou /resume
  ├─► session_before_switch (pode cancelar)
  ├─► session_shutdown
  ├─► session_start { reason: "new" | "resume", previousSessionFile? }
  └─► resources_discover { reason: "startup" }

/fork ou /clone
  ├─► session_before_fork (pode cancelar)
  ├─► session_shutdown
  ├─► session_start { reason: "fork", previousSessionFile }
  └─► resources_discover { reason: "startup" }

/compact ou auto-compaction
  ├─► session_before_compact (pode cancelar ou customizar)
  └─► session_compact

/tree navigation
  ├─► session_before_tree (pode cancelar ou customizar)
  └─► session_tree

/model ou Ctrl+P (model selection/cycling)
  ├─► thinking_level_select
  └─► model_select

thinking level changes
  └─► thinking_level_select

exit (Ctrl+C, Ctrl+D, SIGHUP, SIGTERM)
  └─► session_shutdown
```

### Tabela Completa de Eventos

| Evento | Trigger | Pode Bloquear/Modificar | Descrição |
|--------|---------|------------------------|-----------|
| `project_trust` | Antes do pi decidir trust do projeto | **Sim** — retorna `{ trusted: "yes" | "no" | "undecided" }` | Apenas user/global/CLI extensions; primeiro yes/no vence |
| `resources_discover` | Após `session_start` (startup ou reload) | **Sim** — retorna paths | Contribuir skill/prompt/theme paths |
| `session_start` | Sessão iniciada/carregada/recarregada | Não | `event.reason`: startup, reload, new, resume, fork |
| `session_before_switch` | Antes de `/new` ou `/resume` | **Sim** — retorna `{ cancel: true }` | Pode cancelar troca de sessão |
| `session_before_fork` | Antes de `/fork` ou `/clone` | **Sim** — retorna `{ cancel: true }` | Pode cancelar fork/clone |
| `session_before_compact` | Antes da compactação | **Sim** — retorna `{ cancel: true }` ou compaction custom | Pode cancelar ou fornecer summary custom |
| `session_compact` | Após compactação | Não | Notificação apenas |
| `session_before_tree` | Antes de `/tree` | **Sim** — retorna `{ cancel: true }` ou summary custom | Pode cancelar ou customizar |
| `session_tree` | Após `/tree` | Não | Notificação apenas |
| `session_shutdown` | Antes do teardown da sessão | Não | Cleanup de recursos |
| `before_agent_start` | Após prompt do usuário, antes do loop do agente | **Sim** — inject message, modificar system prompt | Pode injetar mensagem persistente ou substituir system prompt |
| `agent_start` | Loop do agente começa | Não | Por prompt do usuário |
| `agent_end` | Loop do agente termina | Não | Recebe `event.messages` |
| `turn_start` | Cada turno começa | Não | `event.turnIndex`, `event.timestamp` |
| `turn_end` | Cada turno termina | Não | `event.message`, `event.toolResults` |
| `message_start` | Mensagem começa | Não | User, assistant, toolResult |
| `message_update` | Streaming do assistant | Não | Token-by-token |
| `message_end` | Mensagem finalizada | **Sim** — retorna `{ message }` substituindo | Deve manter mesmo role |
| `tool_execution_start` | Pré-execução da tool | Não | Ordem do assistant no paralelo |
| `tool_execution_update` | Streaming da tool | Não | Pode intercalar em paralelo |
| `tool_execution_end` | Tool finalizada | Não | Ordem de conclusão |
| `context` | Antes de cada chamada LLM | **Sim** — retorna `{ messages }` | Deep copy, seguro modificar/filtrar |
| `before_provider_request` | Antes do HTTP request | **Sim** — retorna novo payload | Reescrever payload do provider |
| `after_provider_response` | Após resposta HTTP | Não | Status + headers antes do stream |
| `model_select` | Modelo muda (`/model`, Ctrl+P, restore) | Não | Notificação para UI |
| `thinking_level_select` | Thinking level muda | Não | Notificação apenas |
| `tool_call` | Após `tool_execution_start`, antes da execução | **Sim** — retorna `{ block: true }`, muta `event.input` | **Principal ponto de interceptação** — input mutável, chaining |
| `tool_result` | Após execução, antes de `tool_execution_end` | **Sim** — patches parciais (content, details, isError) | Chaining estilo middleware |
| `user_bash` | Usuário executa `!` ou `!!` | **Sim** — retorna operations custom ou resultado direto | Interceptação total de comandos shell |
| `input` | Input do usuário (após commands, antes skill/template) | **Sim** — retorna `{ action: "continue" | "transform" | "handled" }` | Transformar texto/images, handled sem LLM, ou passar |

---

## 2. ExtensionContext

Disponível em **todos os handlers**. Recebido como `ctx: ExtensionContext`.

### Propriedades Core

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `ctx.ui` | `UIContext` | Métodos de interação com usuário (ver seção Custom UI) |
| `ctx.mode` | `"tui" | "rpc" | "json" | "print"` | Modo de execução atual |
| `ctx.hasUI` | `boolean` | `true` em TUI/RPC, `false` em print/JSON |
| `ctx.cwd` | `string` | Diretório de trabalho atual |
| `ctx.isProjectTrusted()` | `() => boolean` | Status de trust do projeto local |
| `ctx.sessionManager` | `SessionManager` | Acesso **read-only** ao estado da sessão |
| `ctx.modelRegistry` / `ctx.model` | `ModelRegistry / Model` | Acesso a modelos e API keys |
| `ctx.signal` | `AbortSignal | undefined` | Sinal de abort do agente (tipicamente undefined em idle) |

### Control Flow

```typescript
ctx.isIdle()                    // Agente está ocioso?
ctx.abort()                     // Aborta turno atual do agente
ctx.hasPendingMessages()        // Mensagens pendentes (steering/follow-up)?
ctx.shutdown()                  // Shutdown graceful (deferido até idle)
ctx.getContextUsage()           // { tokens, limit, percentage } | undefined
ctx.compact({                   // Trigger compactação
  customInstructions?: string,
  onComplete?: (result) => void,
  onError?: (error) => void,
})
ctx.getSystemPrompt()           // String do system prompt atual
```

### sessionManager

```typescript
ctx.sessionManager.getEntries()       // Todas as entries
ctx.sessionManager.getBranch()        // Branch atual
ctx.sessionManager.getLeafId()        // Leaf entry ID atual
ctx.sessionManager.getSessionFile()   // Path do arquivo de sessão
ctx.sessionManager.getLabel(entryId)  // Label de uma entry
```

---

## 3. ExtensionCommandContext

Comandos (`pi.registerCommand`) recebem `ExtensionCommandContext`, que **estende** `ExtensionContext` com métodos de controle de sessão. Só disponíveis em comandos (chamar de event handlers causaria deadlock).

```typescript
// Inspecionar inputs do system prompt
ctx.getSystemPromptOptions()
// Retorna: { customPrompt, selectedTools, toolSnippets, promptGuidelines,
//           appendSystemPrompt, cwd, contextFiles, skills }

// Aguardar agente finalizar streaming
await ctx.waitForIdle()

// Criar nova sessão
await ctx.newSession({
  parentSession: file,         // sessão pai
  setup: async (sm) => { /* mutate SessionManager */ },
  withSession: async (ctx) => { /* usar ctx da nova sessão */ },
})

// Fork a partir de uma entry
await ctx.fork("entry-id-123", {
  position: "before" | "at",  // "before" (default) ou "at" (clone)
  withSession: async (ctx) => { /* ... */ },
})

// Navegar na árvore
await ctx.navigateTree("entry-id", {
  summarize: true,
  customInstructions: "Focus on X",
  replaceInstructions: false,
  label: "checkpoint",
})

// Trocar para outra sessão
await ctx.switchSession("/path/to/session.jsonl", {
  withSession: async (ctx) => { /* ... */ },
})

// Trigger /reload
await ctx.reload()
```

> **⚠️ Atenção:** Após `newSession`, `fork` ou `switchSession`, o `pi` e `ctx` antigos ficam **stale**. Use o `withSession` callback para trabalho pós-substituição.

---

## 4. ExtensionAPI Methods (`pi.`)

### Event Subscription

```typescript
pi.on(eventName, handler)   // Subscribe a qualquer evento da tabela acima
```

### Tool Registration

```typescript
pi.registerTool(definition) // Registrar tool customizada (hot-refresh via /reload)
```

### Mensagens & Persistência

```typescript
pi.sendMessage(message, options?)         // Injetar mensagem customizada no LLM
pi.sendUserMessage(content, options?)     // Mensagem como se fosse do usuário (ativa turno)
pi.appendEntry(customType, data?)         // Persistir estado na sessão (fora do contexto LLM)
```

### Metadados de Sessão

```typescript
pi.setSessionName(name)                   // Nome de exibição da sessão
pi.getSessionName()                       // Obter nome
pi.setLabel(entryId, label | undefined)   // Label em entry (persiste, aparece em /tree)
```

### Comandos

```typescript
pi.registerCommand("name", {
  description: "O que faz",
  handler: async (args: string, ctx: ExtensionCommandContext) => { },
  getArgumentCompletions: (prefix: string) => string[],  // Autocomplete
})
pi.getCommands()                          // Listar todos comandos invocáveis
```

### Renderização & Atalhos

```typescript
pi.registerMessageRenderer(customType, (message, options, theme) => Component)
pi.registerShortcut("ctrl+x", {
  description: "...",
  handler: async (ctx) => { },
})
pi.registerFlag("my-flag", {
  type: "boolean",
  default: false,
  description: "...",
})
pi.getFlag("my-flag")                     // Valor atual da flag
```

### Execução & Tools

```typescript
pi.exec(command, args?, options?)          // Executar comando shell
pi.getActiveTools()                        // string[] — nomes das tools ativas
pi.getAllTools()                           // metadados de todas as tools
pi.setActiveTools(["read", "write"])       // Habilitar/desabilitar tools em runtime
```

### Modelo & Thinking

```typescript
pi.setModel("provider/model-id")           // Mudar modelo atual
pi.getThinkingLevel()                      // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
pi.setThinkingLevel("medium")              // Set thinking level (clamped ao modelo)
```

### Event Bus (Inter-Extension)

```typescript
pi.events.on(event, handler)     // Subscribe a eventos entre extensions
pi.events.emit(event, data)      // Emitir evento para outras extensions
```

### Provider Registration

```typescript
pi.registerProvider("my-provider", {
  name: "My Provider",
  baseUrl: "http://localhost:1234/v1",
  apiKey: "$ENV_VAR",           // literal, env var, ou !command
  api: "openai-completions",    // anthropic-messages | openai-completions | openai-responses | etc.
  headers?: Record<string, string>,
  authHeader?: boolean,
  oauth?: { name, login, refreshToken, getApiKey },
  streamSimple?: CustomStreamImpl,
  models?: ModelDefinition[],
})
pi.unregisterProvider("my-provider")
```

---

## 5. Custom Tools

### Definição Completa

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Descrição para o LLM",
  promptSnippet: "Linha única para Available tools",
  promptGuidelines: ["Guideline quando ativa"],

  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),

  prepareArguments(args) { /* migração opcional de schema */ },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    if (signal?.aborted) return { content: [{ type: "text", text: "Cancelled" }] }

    onUpdate?.({ content: [{ type: "text", text: "Working..." }] })

    const result = await pi.exec("cmd", [], { signal })

    // DEVE truncar output (50KB / 2000 linhas)
    // DEVE throw para sinalizar erro (isError: true)

    return {
      content: [{ type: "text", text: "Done" }],   // Vai pro LLM
      details: { data: result },                     // Persiste + render
      terminate: true,                               // Skip follow-up LLM call
    }
  },

  // Render customizado (opcional)
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
  renderShell: "self",  // Controle total do framing
})
```

### Overriding Built-in Tools

- Registrar com `name` igual a built-in (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) → mostra warning
- `pi --no-builtin-tools -e ./ext.ts` → desabilita **todas** built-ins
- Herança de render: slots omitidos usam fallback built-in

### Remote Execution

```typescript
import { createReadTool, createBashTool, type ReadOperations } from "@earendil-works/pi-coding-agent"

const remoteRead = createReadTool(cwd, {
  operations: {
    readFile: (path) => sshExec(remote, `cat ${path}`),
    access: (path) => sshExec(remote, `test -r ${path}`).then(() => {}),
  },
})

// Switching dinâmico
pi.registerTool({
  ...remoteRead,
  async execute(id, params, signal, onUpdate, ctx) {
    const ssh = getSshConfig()
    if (ssh) {
      const tool = createReadTool(cwd, { operations: createRemoteOps(ssh) })
      return tool.execute(id, params, signal, onUpdate)
    }
    return localRead.execute(id, params, signal, onUpdate)
  },
})
```

**Interfaces disponíveis:** `ReadOperations`, `WriteOperations`, `EditOperations`, `BashOperations`, `LsOperations`, `GrepOperations`, `FindOperations`.

### Output Truncation (Obrigatório)

```typescript
import { truncateHead, truncateTail, formatSize, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent"

const truncation = truncateHead(output, { maxLines: 2000, maxBytes: 50 * 1024 })
if (truncation.truncated) {
  const tempFile = writeTempFile(output)
  result += `\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines... ${tempFile}]`
}
```

### Múltiplas Tools com Estado Compartilhado

```typescript
export default function (pi: ExtensionAPI) {
  let connection = null

  pi.registerTool({ name: "db_connect", ... })
  pi.registerTool({ name: "db_query", ... })
  pi.registerTool({ name: "db_close", ... })

  pi.on("session_shutdown", async () => {
    connection?.close()
  })
}
```

### Render Customizado de Tool

```typescript
pi.registerTool({
  name: "my_tool",
  renderShell: "self",

  renderCall(args, theme, context) {
    // context: { args, state, lastComponent, invalidate(), toolCallId, cwd,
    //            executionStarted, argsComplete, isPartial, expanded, showImages, isError }
    const text = (context.lastComponent as Text) ?? new Text("", 0, 0)
    text.setText(theme.fg("toolTitle", "my_tool ") + theme.fg("muted", args.action))
    return text
  },

  renderResult(result, { expanded, isPartial }, theme, context) {
    if (isPartial) return new Text(theme.fg("warning", "Processing..."), 0, 0)
    if (result.details?.error) return new Text(theme.fg("error", `Error: ${result.details.error}`), 0, 0)

    let text = theme.fg("success", "✓ Done")
    if (expanded && result.details?.items) {
      // Mostrar detalhes
    }
    return new Text(text, 0, 0)
  },
})
```

---

## 6. Custom UI

### Dialogs (requerem `ctx.hasUI`)

```typescript
// Seleção
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"])

// Confirmação (retorna boolean)
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone")
const timed = await ctx.ui.confirm("Auto-cancel", "5s countdown", { timeout: 5000 })
// timeout → retorna undefined (select), false (confirm), undefined (input)

// Input
const name = await ctx.ui.input("Name:", "placeholder")

// Editor multi-linha
const text = await ctx.ui.editor("Edit:", "prefilled text")

// AbortSignal manual
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)
const confirmed = await ctx.ui.confirm("Title", "Msg", { signal: controller.signal })
```

### Notificações

```typescript
ctx.ui.notify("Done!", "info")     // "info" | "warning" | "error"
```

### Status Bar (Footer)

```typescript
ctx.ui.setStatus("my-ext", "Processing...")    // Aparece no footer
ctx.ui.setStatus("my-ext", undefined)           // Remove
```

### Working Indicator

```typescript
ctx.ui.setWorkingMessage("Thinking...")
ctx.ui.setWorkingVisible(false)                     // Esconde built-in
ctx.ui.setWorkingIndicator({                        // Custom spinner
  frames: [theme.fg("accent", "●")],
  intervalMs: 120,
})
```

### Widgets (acima/abaixo do editor)

```typescript
// Widget de texto
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"])
ctx.ui.setWidget("my-widget", ["Line 1"], { placement: "belowEditor" })

// Widget com componente customizado
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(theme.fg("accent", "Custom"), 0, 0))

// Remover
ctx.ui.setWidget("my-widget", undefined)
```

### Footer Customizado (substitui built-in)

```typescript
ctx.ui.setFooter((tui, theme) => ({
  render(width: number) {
    return [theme.fg("dim", "Custom footer")]
  },
  invalidate() {},
}))
ctx.ui.setFooter(undefined) // Restaura built-in
```

### Terminal Title

```typescript
ctx.ui.setTitle("pi - my-project")
```

### Editor

```typescript
ctx.ui.setEditorText("Prefill text")
ctx.ui.getEditorText()      // Texto atual
ctx.ui.pasteToEditor("content")  // Dispara paste handling

ctx.ui.getToolsExpanded()
ctx.ui.setToolsExpanded(true)
```

### Editor Customizado

```typescript
import { CustomEditor } from "@earendil-works/pi-coding-agent"
import { matchesKey } from "@earendil-works/pi-tui"

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert"

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal"; return
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert"; return
    }
    super.handleInput(data)
  }
}

// Aplicar
pi.on("session_start", (_event, ctx) => {
  ctx.ui.setEditorComponent((_tui, theme, keybindings) =>
    new VimEditor(theme, keybindings)
  )
})

// Compor com editor anterior
const previous = ctx.ui.getEditorComponent()
ctx.ui.setEditorComponent((tui, theme, kb) =>
  new MyEditor(tui, theme, kb, { base: previous?.(tui, theme, kb) })
)
```

### Autocomplete Providers

```typescript
ctx.ui.addAutocompleteProvider((current) => ({
  triggerCharacters: ["#"],

  async getSuggestions(lines, cursorLine, cursorCol, options) {
    const line = lines[cursorLine] ?? ""
    const beforeCursor = line.slice(0, cursorCol)
    const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/)
    if (!match) return current.getSuggestions(lines, cursorLine, cursorCol, options)

    return {
      prefix: `#${match[1] ?? ""}`,
      items: [{ value: "#2983", label: "#2983", description: "..." }],
    }
  },

  applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
    return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix)
  },

  shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
    return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true
  },
}))
```

### Custom Components (Full TUI)

```typescript
// Modal normal — substitui editor até done()
const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter to confirm, Escape to cancel", 1, 1)
  text.onKey = (key) => {
    if (key === "return") done(true)
    if (key === "escape") done(false)
    return true
  }
  return text
})

// Overlay mode (experimental)
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  {
    overlay: true,
    overlayOptions: { anchor: "top-right", width: "50%", margin: 2 },
    onHandle: (handle) => { handle.focus() },
  }
)
```

---

## 7. Message Rendering & Themes

### Custom Message Renderer

```typescript
pi.registerMessageRenderer("my-type", (message, { expanded }, theme) => {
  const text = theme.fg("accent", `[${message.customType}] `)
    + message.content
  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2))
  }
  return new Text(text, 0, 0)
})

// Enviar mensagem com customType
pi.sendMessage({
  customType: "my-type",
  content: "Status update",
  display: true,
  details: { key: "value" },
})
```

### Theme Colors

```typescript
theme.fg("toolTitle", text)   // Nomes de tools
theme.fg("accent", text)      // Destaques
theme.fg("success", text)     // Verde (sucesso)
theme.fg("error", text)       // Vermelho (erro)
theme.fg("warning", text)     // Amarelo (warning)
theme.fg("muted", text)       // Texto secundário
theme.fg("dim", text)         // Texto terciário

theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

### Syntax Highlighting

```typescript
import { highlightCode, getLanguageFromPath } from "@earendil-works/pi-coding-agent"

const highlighted = highlightCode("const x = 1;", "typescript", theme)
const lang = getLanguageFromPath("/path/to/file.rs") // "rust"
```

---

## 8. State Management

| Método | Escopo | Sobrevive a |
|--------|--------|-------------|
| `details` no tool result | Session file (JSONL) | Restarts, branches, forks |
| `pi.appendEntry(type, data)` | Session file | Restarts |
| `pi.setLabel(entryId, label)` | Session file | Restarts (mostrado em /tree) |
| `pi.setSessionName(name)` | Session file | Restarts |
| Variáveis em memória (closures) | Instância da extension | Só sessão atual (morre no shutdown) |
| `pi.events` (event bus) | Processo inteiro | Enquanto pi roda |

### Padrão Recomendado: Reconstruir Estado da Sessão

```typescript
let items: string[] = []

pi.on("session_start", async (_event, ctx) => {
  items = [] // reset
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "toolResult") {
      if (entry.message.toolName === "my_tool") {
        items = entry.message.details?.items ?? []
      }
    }
  }
})

pi.registerTool({
  name: "my_tool",
  async execute(...) {
    items.push("new item")
    return {
      content: [{ type: "text", text: "Added" }],
      details: { items: [...items] },
    }
  },
})
```

---

## 9. Locais de Extensão & Estilos

### Auto-Discovery

| Local | Escopo | Formato |
|-------|--------|---------|
| `~/.pi/agent/extensions/*.ts` | Global (todos projetos) | Arquivo único |
| `~/.pi/agent/extensions/*/index.ts` | Global (todos projetos) | Subdiretório |
| `.pi/extensions/*.ts` | Projeto-local (após trust) | Arquivo único |
| `.pi/extensions/*/index.ts` | Projeto-local (após trust) | Subdiretório |

### Paths Adicionais (settings.json)

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/path/to/extension.ts",
    "/path/to/extension/dir"
  ]
}
```

### Estilos de Extensão

| Estilo | Estrutura | Uso |
|--------|-----------|-----|
| **Single file** | `my-extension.ts` | Simples |
| **Directory** | `my-extension/index.ts` + módulos | Multi-arquivo |
| **Package** | `package.json` + `node_modules/` + `src/index.ts` | Precisa de npm deps |

**package.json de extension package:**
```json
{
  "name": "my-extension",
  "dependencies": { "zod": "^3.0.0" },
  "pi": { "extensions": ["./src/index.ts"] }
}
```

### Carregamento

- Loader: **jiti** (TypeScript direto, sem compilação)
- Factory: síncrona ou **async** (pi aguarda antes do startup continuar)
- Hot reload: `/reload` descobre arquivos em diretórios auto-discover
- CLI: `pi -e ./path.ts` para testes rápidos apenas
- ⚠️ **Segurança:** Extensions rodam com permissões totais do sistema

---

## 10. Mode Behavior

| Modo | `ctx.mode` | `ctx.hasUI` | Capabilities |
|------|------------|-------------|--------------|
| **Interactive (TUI)** | `"tui"` | `true` | Completo: dialogs, custom components, terminal input, rendering direto |
| **RPC** (`--mode rpc`) | `"rpc"` | `true` | Dialogs/notifications via JSON protocol; `custom()` retorna `undefined` |
| **JSON** (`--mode json`) | `"json"` | `false` | Event stream para stdout; UI methods são no-ops |
| **Print** (`-p`) | `"print"` | `false` | Extensions rodam mas sem prompt; processo sai após prompts |

### Guard Pattern

```typescript
// TUI-only
if (ctx.mode === "tui") {
  await ctx.ui.custom(...)
  ctx.ui.setEditorComponent(...)
}

// TUI + RPC
if (ctx.hasUI) {
  await ctx.ui.confirm(...)
  ctx.ui.notify(...)
  ctx.ui.setStatus(...)
  ctx.ui.setWidget(...)
}
```

---

## 11. Importações Disponíveis

| Package | Propósito |
|---------|-----------|
| `@earendil-works/pi-coding-agent` | Tipos (ExtensionAPI, ExtensionContext, eventos, SessionManager, CustomEditor, tools, etc.) |
| `typebox` | Schema definitions para tool parameters |
| `@earendil-works/pi-ai` | AI utilities (`StringEnum` para enums compatíveis com Google) |
| `@earendil-works/pi-tui` | TUI components (Text, matchesKey, etc.) |
| `node:fs`, `node:path`, `node:child_process`, etc. | Node.js built-ins |
| npm packages | Funcionam via `package.json` + `npm install` |

> Para packages distribuídos com `pi install`, runtime deps vão em `dependencies`. Package installation usa `npm install --omit=dev` por padrão.

---

## 12. Exemplos de Referência

> Repo: https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions

| Categoria | Exemplos | APIs-Chave |
|-----------|----------|------------|
| **Tools** | hello, question, questionnaire, todo, dynamic-tools, structured-output, truncated-tool, tool-override | `registerTool`, `renderResult`, `appendEntry`, `truncateHead` |
| **Commands** | pirate, summarize, handoff, qna, send-user-message, reload-runtime, shutdown-command | `registerCommand`, `sendUserMessage`, `reload()`, `shutdown()` |
| **Events & Gates** | permission-gate, project-trust, protected-paths, confirm-destructive, dirty-repo-guard, input-transform, model-status, system-prompt-header, claude-rules, prompt-customizer, file-trigger | `on("tool_call")`, `on("input")`, `on("session_before_*")`, `on("before_provider_request")` |
| **Compaction & Sessions** | custom-compaction, trigger-compact, git-checkpoint, git-merge-and-resolve, auto-commit-on-exit | `on("session_before_compact")`, `compact()`, `on("turn_start")`, `exec` |
| **UI Components** | status-line, working-indicator, github-issue-autocomplete, custom-footer, custom-header, modal-editor, rainbow-editor, widget-placement, overlay-test, notify, timed-confirm, mac-system-theme | `setStatus`, `setWorkingIndicator`, `addAutocompleteProvider`, `setFooter`, `setEditorComponent`, `ui.custom` |
| **Complex** | plan-mode/, preset, tools.ts | Todos event types, `registerShortcut`, `registerFlag`, `setActiveTools` |
| **Remote & Sandbox** | ssh, interactive-shell, sandbox/, gondolin/, subagent/ | `on("user_bash")`, tool operations, built-in overrides |
| **Games** | snake, space-invaders, doom-overlay/ | `registerCommand`, `ui.custom`, keyboard handling |
| **Providers** | custom-provider-anthropic/, custom-provider-gitlab-duo/ | `registerProvider` com OAuth |
| **Messages** | message-renderer, event-bus | `registerMessageRenderer`, `sendMessage`, `pi.events` |
| **Session Metadata** | session-name, bookmark | `setSessionName`, `getSessionName`, `setLabel` |

---

## 13. Considerações de Shutdown

### Recursos de Longa Vida

> ⚠️ Extension factories podem executar em invocações que **nunca iniciam sessão**. Não inicie processos, sockets, file watchers ou timers na factory.

```typescript
// ❌ ERRADO: recurso iniciado na factory
export default function (pi: ExtensionAPI) {
  const watcher = fs.watch(".", () => {}) // NUNCA!
}

// ✅ CORRETO: iniciar no session_start, cleanup no session_shutdown
export default function (pi: ExtensionAPI) {
  let watcher: fs.FSWatcher | null = null

  pi.on("session_start", () => {
    watcher = fs.watch(".", () => {})
  })

  pi.on("session_shutdown", () => {
    watcher?.close()
    watcher = null
  })
}
```

### Shutdown Graceful

```typescript
// ctx.shutdown() — solicita shutdown graceful
// TUI: deferido até agente ficar idle (após mensagens pendentes)
// RPC: deferido até próximo idle
// Print: no-op (processo sai automaticamente)

pi.on("tool_call", (event, ctx) => {
  if (isFatal(event.input)) {
    ctx.shutdown() // Emite session_shutdown antes de sair
  }
})
```

---

## 14. Provider Customizado

### Exemplo: Descoberta Dinâmica com Async Factory

```typescript
export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://localhost:1234/v1/models")
  const payload = (await response.json()) as {
    data: Array<{ id: string; name?: string; context_window?: number; max_tokens?: number }>
  }

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
  })
}
```

### Provider Config Schema

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | `string` | Nome de exibição |
| `baseUrl` | `string` | Endpoint da API |
| `apiKey` | `string` | Literal, `$ENV_VAR`, ou `!command` |
| `api` | `string` | `anthropic-messages`, `openai-completions`, `openai-responses`, etc. |
| `headers?` | `Record<string, string>` | Headers custom |
| `authHeader?` | `boolean` | Usar header de autenticação |
| `oauth?` | `{ name, login, refreshToken, getApiKey }` | Autenticação OAuth |
| `streamSimple?` | `CustomStreamImpl` | Implementação de streaming custom |
| `models?` | `ModelDefinition[]` | Definições de modelo |

---

> **Documento gerado a partir de:** https://pi.dev/docs/latest/extensions
> **Repo de exemplos:** https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions