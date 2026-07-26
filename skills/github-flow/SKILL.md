---
name: github-flow
description: Gerencia pull requests e issues via GitHub. Usa tools pi-github para criar, listar e buscar PRs/issues. Integra com git-commit para fluxo completo.
---

# GitHub Flow

## Ferramentas disponíveis

| Tool | Quando usar |
|---|---|
| `github_create_pr` | Após push de branch: abrir PR com title, body, head, base |
| `github_create_issue` | Reportar bug, sugerir melhoria, ou registrar tarefa |
| `github_search` | Antes de criar issue/PR: verificar se já existe duplicata |
| `github_list_prs` | Consultar PRs abertas por estado, autor |
| `github_list_issues` | Consultar issues abertas por label, estado |
| `github_pr_view` | Ver detalhes completos de um PR (body, status, mergeabilidade, labels, assignees, comentários) |
| `github_issue_view` | Ver detalhes completos de uma issue (body, labels, assignees, comentários) |

**Comando `/github`:** para ações interativas (editor de body, seleção de PRs).

---

## Formato Obrigatório: Conventional Commits

Tanto PRs quanto Issues usam o formato **Conventional Commits** no título:

```
<type>(<scope>)[!]: <description> [#<task-number>]
```

| Parte | Obrigatório | Descrição |
|-------|-------------|-----------|
| `type` | ✅ | Tipo da mudança (lista abaixo) |
| `scope` | ✅ | Módulo afetado, ex: `auth`, `api/orders`, `docker` |
| `!` | ❌ | Se breaking change, adicionar `!` após scope |
| `description` | ✅ | Descrição curta, imperativo, PT-BR |
| `#task-number` | ❌ | Nº da tarefa extraído do branch, ao final do título |

### Tipos válidos

| Tipo | Uso |
|------|-----|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Refatoração sem mudar comportamento |
| `docs` | Documentação |
| `style` | Formatação, espaços, ponto-e-vírgula |
| `test` | Testes |
| `chore` | Tarefas de manutenção |
| `ci` | Configuração de CI |
| `build` | Build, dependências |
| `perf` | Melhoria de performance |
| `revert` | Reversão de commit |

### Exemplos

```
feat(auth): Adiciona login com JWT #25321
fix(api/orders): Corrige off-by-one na paginação #25322
refactor(checkout): Extrai validação de cupom #25323
docs(readme): Atualiza exemplos de uso #25324
feat(api)!: Remove suporte a v1 #25325
```

### Breaking changes

Sinalizar em **dois lugares**:
1. `!` no título após o scope: `feat(api)!: ...`
2. `BREAKING CHANGE:` no início do body com explicação do impacto e migração

```
Título: feat(api)!: Remove suporte a API v1 #25325

Body:
BREAKING CHANGE: Endpoints /api/v1/* foram removidos.
Migre para /api/v2/*. Consulte docs/migration-v2.md
```

### Número da tarefa

Extrair do branch e incluir ao final do título:

```bash
git branch --show-current | grep -oE '[0-9]+$|[a-zA-Z]+[0-9]+$'
# Ex: feat/auth-25321 → 25321 → "feat(auth): ... #25321"
```

---

## Validação em 3 camadas

| Camada | O quê | Responde por |
|--------|-------|-------------|
| **Skill** | Instrução nesta skill — LLM segue o formato | Documentação |
| **Tool** | `github_create_pr` e `github_create_issue` validam o título antes de criar (regex) | Código da extensão |
| **CI** | GitHub Action no repositório valida o título do PR após aberto | `.github/workflows/pr-lint.yml` |

### CI: action-semantic-pull-request

Adicionar ao repositório para validar PRs no servidor:

```yaml
# .github/workflows/pr-lint.yml
name: Lint PR
on:
  pull_request_target:
    types: [opened, edited, reopened]
jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            refactor
            docs
            style
            test
            chore
            ci
            build
            perf
            revert
          requireScope: true
```

Essa action:
- Bloqueia PR se título não seguir CC
- Exige scope (`requireScope: true`)
- Comenta no PR explicando o erro

Combinar com **branch protection** no GitHub: marcar `Lint PR` como required check.

---

## Fluxo: Criar Pull Request

```
1. [branch] git checkout -b feat/descricao-<num>   # se ainda não existe
2. [código] fazer alterações
3. [commit] git add + git commit                     # ver skill git-commit
4. [push]   git push origin <branch>                 # push da branch
5. [PR]     github_create_pr                         # abrir PR
```

### Parâmetros da tool create_pr

```
type: "feat"                     # tipo obrigatório
scope: "api/orders"              # escopo obrigatório
title: "Adiciona rota GET /orders com paginação"   # descrição curta
breaking: false                  # ou true (adiciona !)
taskNumber: 25321                # número da tarefa (opcional)
body: "..."                      # markdown livre; se breaking=true, incluir BREAKING CHANGE:
head: "feat/orders-25321"        # branch origem
base: "main"                     # branch destino
draft: false                     # ou true para WIP
```

### Exemplo de chamada

```
github_create_pr
  type: "feat"
  scope: "api/orders"
  title: "Adiciona rota GET /orders com paginação"
  body: "- Implementa endpoint de listagem de pedidos.
  - Suporte a paginação via query params page/limit.
  - Testes unitários para o handler."
  head: "feat/orders-25321"
  base: "main"
```

Resultado: título `feat(api/orders): Adiciona rota GET /orders com paginação #25321`

---

## Fluxo: Criar Issue

```
1. [buscar]   github_search          # verificar duplicatas
2. [criar]    github_create_issue    # type + scope + title + body + labels
```

### Parâmetros da tool create_issue

```
type: "fix"                      # tipo obrigatório
scope: "auth"                    # escopo obrigatório
title: "Erro 500 ao autenticar com token expirado"
breaking: false
taskNumber: 25326
body: "..."                      # markdown livre
labels: ["bug"]                  # labels opcionais
assignees: ["usuario"]           # assignees opcionais
```

---

## Boas práticas

- **Título ≤ 72 caracteres.** Sempre.
- **Imperativo, PT-BR.** "Adiciona", não "Adicionado" nem "Adicionou".
- **Body explica o porquê.** O diff já mostra o que mudou. Body responde *por que*.
- **PRs pequenos e focados.** Um PR = uma mudança atômica.
- **Buscar antes de criar.** `github_search` antes de `create_issue` — se existir duplicata, comenta nela.
- **Sempre extrair task number do branch.** `git branch --show-current | grep -oE '[0-9]+$'`

---

## Integração com git-commit

- `git-commit` gerencia o commit local
- `github-flow` gerencia a publicação (push + PR)
- **Ordem correta:** commit → push → PR
- **Consistência:** mesmo type/scope no commit e no PR

```
Branch: feat/auth-25321
  ↓ extrai
task: 25321
  ↓
git commit -m "feat(auth): Adiciona rota de login #25321"
  ↓
github_create_pr type=feat scope=auth title="Adiciona rota de login" taskNumber=25321
```
