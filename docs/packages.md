# Pi.dev — Pi Packages

> Fonte: https://pi.dev/docs/latest/packages
> Gerado em: 2026-06-16

---

## Sumário

1. [Conceito](#conceito)
2. [Install & Manage](#1-install--manage)
3. [Package Sources](#2-package-sources)
4. [Criar um Pi Package](#3-criar-um-pi-package)
5. [Gallery Metadata](#4-gallery-metadata)
6. [Package Structure](#5-package-structure)
7. [Dependencies](#6-dependencies)
8. [Package Filtering](#7-package-filtering)
9. [Enable/Disable Resources](#8-enabledisable-resources)
10. [Scope & Deduplication](#9-scope--deduplication)

---

## Conceito

Pi packages agrupam **extensions, skills, prompt templates e themes** para distribuição via **npm** ou **git**. Declarados em `package.json` (chave `pi`) ou diretórios convencionais.

---

## 1. Install & Manage

```bash
# Instalar
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
pi install https://github.com/user/repo
pi install /absolute/path/to/package
pi install ./relative/path/to/package

# Remover
pi remove npm:@foo/bar

# Listar pacotes instalados (do settings)
pi list

# Atualizar
pi update                        # pi CLI + packages + reconcile git refs
pi update --extensions           # packages + reconcile apenas
pi update --self                 # pi CLI apenas
pi update --self --force         # reinstall mesmo se current
pi update npm:@foo/bar           # um package específico
pi update --extension npm:@foo/bar

# Testar sem instalar (temp dir, apenas sessão atual)
pi -e npm:@foo/bar
pi -e git:github.com/user/repo
```

### Escopo de Instalação

| Flag | Settings File | Compartilhável |
|------|---------------|----------------|
| (default) | `~/.pi/agent/settings.json` | Não (user-local) |
| `-l` | `.pi/settings.json` | Sim (project, versionado) |

**Project settings:** pi instala packages faltando automaticamente no startup, após o projeto ser trusted.

---

## 2. Package Sources

### npm

```
npm:@scope/pkg@1.2.3
npm:pkg
```

| Aspecto | Detalhe |
|---------|---------|
| Versionamento | Pinned (skip em `pi update`) |
| Pasta global | `~/.pi/agent/npm/` |
| Pasta project | `.pi/npm/` |
| npmCommand | Pinar wrapper (mise, asdf) via settings: `{ "npmCommand": ["mise", "exec", "node@20", "--", "npm"] }` |

### git

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

| Aspecto | Detalhe |
|---------|---------|
| Refs | Tags/commits pinned. `pi update` não move refs, só reconcilia clone |
| Pasta global | `~/.pi/agent/git/<host>/<path>` |
| Pasta project | `.pi/git/<host>/<path>` |
| Reconciliação | Reseta + clean + `npm install` se `package.json` existe |
| SSH | Usa `~/.ssh/config`. CI: `GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND="ssh -o BatchMode=yes"` |

**Shorthands vs URLs:**
- Sem prefixo `git:` → só protocol URLs (`https://`, `http://`, `ssh://`, `git://`)
- Com prefixo `git:` → aceita shorthands incluindo `github.com/user/repo` e `git@github.com:user/repo`

### Local Paths

```
/absolute/path/to/package
./relative/path/to/package
```

| Aspecto | Detalhe |
|---------|---------|
| Cópia | **Não** copia — aponta direto |
| Resolução | Relativos resolvidos contra o settings file |
| Se for file | Carrega como extension única |
| Se for dir | Pi carrega recursos usando regras de package |

---

## 3. Criar um Pi Package

Adicionar manifest `pi` em `package.json` + keyword `pi-package`:

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

- Paths são **relativos à raiz do package**
- Arrays aceitam **glob patterns** e **`!` exclusions**

### Filter/Glob Exemplos

```json
{
  "pi": {
    "extensions": ["extensions/**/*.ts", "!extensions/legacy/**"],
    "skills": ["./skills"],
    "prompts": ["prompts/review.md"],
    "themes": ["themes/*.json", "!themes/legacy.json"]
  }
}
```

---

## 4. Gallery Metadata

Para preview na package gallery (requer keyword `pi-package`):

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "video": "https://example.com/demo.mp4",
    "image": "https://example.com/screenshot.png"
  }
}
```

| Campo | Formato | Comportamento |
|-------|---------|---------------|
| `video` | MP4 | Autoplay no hover; click abre fullscreen player |
| `image` | PNG, JPEG, GIF, WebP | Preview estático |

Se ambos definidos, `video` tem precedência.

---

## 5. Package Structure

### Convention Directories

Se **nenhum manifest** `pi` estiver presente, pi auto-descobre:

| Diretório | Carrega |
|-----------|---------|
| `extensions/` | Arquivos `.ts` e `.js` |
| `skills/` | Recursivo: dirs com `SKILL.md` + `.md` root como skills |
| `prompts/` | Arquivos `.md` |
| `themes/` | Arquivos `.json` |

---

## 6. Dependencies

| Tipo | Onde declarar | Comportamento |
|------|---------------|---------------|
| Runtime deps third-party | `dependencies` | Instalados auto em `pi install` |
| Core pi packages | `peerDependencies: "*"` | **Não bundlar** — já fornecidos pelo pi |
| Outros pi packages | `dependencies` + `bundledDependencies` | **Bundlar** no tarball |

### Core Packages (peerDependencies)

```json
{
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
```

### Bundling Outros Pi Packages

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "pi": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

> ⚠️ Pi carrega packages com **module roots separados**. Installs separados não colidem nem compartilham módulos.

---

## 7. Package Filtering

Controlar o que cada package carrega via **object form** em settings:

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

| Sintaxe | Significado |
|---------|-------------|
| (omit key) | Carrega **tudo** desse tipo |
| `[]` | Carrega **nenhum** desse tipo |
| `!pattern` | Exclui matches (glob) |
| `+path` | Force-include path exato (relativo à raiz do package) |
| `-path` | Force-exclude path exato (relativo à raiz do package) |

> Filtros aplicam **sobre o manifest** — estreitam o que já é permitido pelo package.

---

## 8. Enable/Disable Resources

Use `pi config` para habilitar/desabilitar extensions, skills, prompt templates e themes de:
- Packages instalados
- Diretórios locais

Funciona em ambos scopes:
- **Global:** `~/.pi/agent/`
- **Project:** `.pi/`

---

## 9. Scope & Deduplication

| Situação | Comportamento |
|----------|---------------|
| Mesmo package em global **e** project | **Project entry vence** |
| Identidade (npm) | Package name |
| Identidade (git) | Repo URL sem ref |
| Identidade (local) | Resolved absolute path |

---

## ⚠️ Security

> Pi packages rodam com **full system access**. Extensions executam código arbitrário; skills podem instruir o modelo a executar qualquer ação, incluindo executáveis. **Revise o source code** antes de instalar third-party packages.