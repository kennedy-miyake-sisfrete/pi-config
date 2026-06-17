# Pi.dev — Prompt Templates

> Fonte: https://pi.dev/docs/latest/prompt-templates
> Gerado em: 2026-06-16

---

## Sumário

1. [Conceito](#conceito)
2. [Locais de Descoberta](#1-locais-de-descoberta)
3. [Formato (Frontmatter + Body)](#2-formato-frontmatter--body)
4. [Argument Hints](#3-argument-hints)
5. [Uso](#4-uso)
6. [Argumentos no Template](#5-argumentos-no-template)

---

## Conceito

Prompt Templates são snippets **Markdown** que expandem em prompts completos. Invocados digitando `/nome` no editor, onde `nome` é o nome do arquivo sem `.md`.

---

## 1. Locais de Descoberta

| Local | Escopo |
|-------|--------|
| `~/.pi/agent/prompts/*.md` | Global |
| `.pi/prompts/*.md` | Projeto (após trust) |
| `prompts/` em packages | Package (`package.json → pi.prompts`) |
| `settings.json → "prompts": [...files ou diretórios]` | Config |
| `--prompt-template <path>` (CLI, repetível) | Sessão |

**Desabilitar:** `--no-prompt-templates`.

### Regra de Carregamento

A descoberta em `prompts/` é **não-recursiva**. Apenas arquivos `.md` na raiz do diretório são descobertos automaticamente. Para templates em subdiretórios, adicione-os explicitamente via `settings.json` ou manifest de package.

---

## 2. Formato (Frontmatter + Body)

```markdown
---
description: Review staged git changes
argument-hint: "<branch>"
---
Review the staged changes (`git diff --cached`). Focus on:
- Bugs and logic errors
- Security issues
- Error handling gaps
```

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `description` | Não | Descrição mostrada no autocomplete. Se ausente, usa a primeira linha não-vazia do body |
| `argument-hint` | Não | Dica de argumentos esperados, exibida no dropdown de autocomplete |

### Convenção de Nome

O filename (sem `.md`) vira o nome do comando. `review.md` → `/review`.

---

## 3. Argument Hints

Use `argument-hint` no frontmatter para mostrar argumentos esperados no autocomplete:

```yaml
---
description: Review PRs from URLs with structured issue and code analysis
argument-hint: "<PR-URL>"
---
```

- `<angle brackets>` = argumento obrigatório
- `[square brackets]` = argumento opcional

**Renderização no autocomplete:**
```
→ pr   <PR-URL>       — Review PRs from URLs with structured issue and code analysis
  is   <issue>        — Analyze GitHub issues (bugs or feature requests)
  wr   [instructions] — Finish the current task end-to-end
  cl   — Audit changelog entries before release
```

---

## 4. Uso

```
/review                           # Expande review.md
/component Button                 # Expande com 1 argumento
/component Button "click handler" # Expande com múltiplos argumentos
```

O autocomplete mostra templates disponíveis com suas descrições ao digitar `/`.

---

## 5. Argumentos no Template

### Sintaxe Disponíveis

| Sintaxe | Significado |
|---------|-------------|
| `$1`, `$2`, ... | Argumentos posicionais |
| `$@` ou `$ARGUMENTS` | Todos os argumentos concatenados |
| `${1:-default}` | Usa arg 1 se presente/não-vazio, senão usa `default` |
| `${@:N}` | Argumentos a partir da posição N (1-indexed) |
| `${@:N:L}` | L argumentos a partir da posição N |

### Exemplos

```markdown
---
description: Create a component
---
Create a React component named $1 with features: $@
```

```markdown
Summarize the current state in ${1:-7} bullet points.
```

**Uso:**
```
/component Button "onClick handler" "disabled support"
# Expande para: Create a React component named Button with features: onClick handler disabled support
```

```
/summarize
# Expande para: Summarize the current state in 7 bullet points.

/summarize 5
# Expande para: Summarize the current state in 5 bullet points.
```