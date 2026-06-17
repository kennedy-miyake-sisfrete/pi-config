# Pi.dev — Skills (Agent Skills Standard)

> Fonte: https://pi.dev/docs/latest/skills
> Gerado em: 2026-06-16

---

## Sumário

1. [Conceito](#conceito)
2. [Locais de Descoberta](#1-locais-de-descoberta)
3. [Usar Skills de Outros Harnesses](#2-usar-skills-de-outros-harnesses)
4. [Skill Commands](#3-skill-commands)
5. [Estrutura de Diretório](#4-estrutura-de-diretório)
6. [SKILL.md — Frontmatter](#5-skillmd--frontmatter)
7. [Validação](#6-validação)
8. [Exemplo Completo](#7-exemplo-completo)
9. [Repositórios de Skills](#8-repositórios-de-skills)

---

## Conceito

Skills são pacotes de capacidade **auto-contidos** que o agente carrega **on-demand**. Implementam o padrão **Agent Skills Specification**.

**Progressive disclosure:** apenas a `description` fica sempre no system prompt. O conteúdo completo (SKILL.md + scripts + referências) é carregado sob demanda pelo agente ou via `/skill:nome`.

---

## 1. Locais de Descoberta

| Local | Escopo | Regras |
|-------|--------|--------|
| `~/.pi/agent/skills/` | Global | Root `.md` → skills individuais; dirs com `SKILL.md` → recursivo |
| `~/.agents/skills/` | Global (harness-agnóstico) | Root `.md` são **ignorados**; só dirs com `SKILL.md` |
| `.pi/skills/` | Projeto (após trust) | Root `.md` → skills individuais; dirs com `SKILL.md` → recursivo |
| `.agents/skills/` (cwd + ancestrais até git root) | Projeto | Root `.md` ignorados; só dirs com `SKILL.md` |
| `skills/` em packages npm/git | Package | Definido em `package.json → pi.skills` |
| `settings.json → "skills": [...]` | Config | Files ou directories |
| `--skill <path>` (CLI, repetível) | Sessão | Additive mesmo com `--no-skills` |

**Desabilitar descoberta:** `--no-skills` (exceto `--skill` explícitos).

---

## 2. Usar Skills de Outros Harnesses

Para reaproveitar skills de Claude Code ou OpenAI Codex:

```json
{
  "skills": [
    "~/.claude/skills",
    "~/.codex/skills"
  ]
}
```

Para skills de projeto no Claude Code:

```json
// .pi/settings.json
{
  "skills": ["../.claude/skills"]
}
```

---

## 3. Skill Commands

Toda skill registra automaticamente um comando `/skill:nome`:

```
/skill:brave-search              # Carrega e executa o skill
/skill:pdf-tools extract         # Carrega com argumentos
```

Argumentos após o comando são anexados ao conteúdo como `User: <args>`.

**Ativar/desativar:** `/settings` ou:

```json
{ "enableSkillCommands": true }
```

---

## 4. Estrutura de Diretório

```
my-skill/
├── SKILL.md              # Obrigatório: frontmatter YAML + instruções Markdown
├── scripts/              # Scripts auxiliares (bash, node, python, etc.)
│   └── process.sh
├── references/           # Documentos detalhados carregados on-demand
│   └── api-reference.md
└── assets/               # Templates, configs, etc.
    └── template.json
```

---

## 5. SKILL.md — Frontmatter

Perante a especificação Agent Skills:

| Campo | Obrigatório | Descrição | Limite |
|-------|-------------|-----------|--------|
| `name` | **Sim** | `a-z`, `0-9`, hífens apenas. Pi **não** exige match com o diretório parent | 64 chars |
| `description` | **Sim** | O que o skill faz e quando usar. **Se ausente, o skill não carrega** | 1024 chars |
| `license` | Não | Nome da licença ou referência a arquivo no bundle | — |
| `compatibility` | Não | Requisitos de ambiente | 500 chars |
| `metadata` | Não | Mapeamento key-value arbitrário | — |
| `allowed-tools` | Não | Lista space-delimited de tools pré-aprovadas (experimental) | — |
| `disable-model-invocation` | Não | `true` = skill oculto do system prompt. Só via `/skill:nome` | — |

### Regras do `name`

- 1 a 64 caracteres
- Apenas letras minúsculas, números e hífens
- Sem hífens no início ou fim
- Sem hífens consecutivos
- **Válido:** `pdf-processing`, `data-analysis`, `code-review`
- **Inválido:** `PDF-Processing`, `-pdf`, `pdf--processing`

### Boas Práticas de `description`

A descrição determina **quando** o agente decide carregar o skill. Seja específico.

✅ **Bom:**
```yaml
description: >
  Extracts text and tables from PDF files, fills PDF forms, and merges
  multiple PDFs. Use when working with PDF documents.
```

❌ **Ruim:**
```yaml
description: Helps with PDFs.
```

---

## 6. Validação

Pi valida skills contra o padrão Agent Skills. A maioria dos problemas produz **warnings** mas o skill ainda carrega:

| Situação | Comportamento |
|----------|---------------|
| Name > 64 chars ou caracteres inválidos | Warning, carrega |
| Name começa/termina com hífen ou hífens consecutivos | Warning, carrega |
| Description > 1024 chars | Warning, carrega |
| Description ausente | **Não carrega** |
| Campos frontmatter desconhecidos | Ignorados |
| Colisão de nomes (mesmo nome, locais diferentes) | Warning, mantém primeiro encontrado |

---

## 7. Exemplo Completo

```
brave-search/
├── SKILL.md
├── search.js
└── content.js
```

**SKILL.md:**
```markdown
---
name: brave-search
description: Web search and content extraction via Brave Search API. Use for searching documentation, facts, or any web content.
---

# Brave Search

## Setup

```bash
cd /path/to/brave-search && npm install
```

## Search

```bash
./search.js "query"              # Basic search
./search.js "query" --content    # Include page content
```

## Extract Page Content

```bash
./content.js https://example.com
```
```

---

## 8. Repositórios de Skills

| Fonte | Conteúdo | Link |
|-------|----------|------|
| **Anthropic Skills** | Document processing (docx, pdf, pptx, xlsx), web development | [GitHub](https://github.com/anthropics/claude-code/skills) |
| **Pi Skills** | Web search, browser automation, Google APIs, transcription | [GitHub](https://github.com/earendil-works/pi-skills) |