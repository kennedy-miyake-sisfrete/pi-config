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

**Comando `/github`:** para ações interativas (editor de body, seleção de PRs).

---

## Fluxo: Criar Pull Request

```
1. [branch] git checkout -b feat/descricao-<num>   # se ainda não existe
2. [código] fazer alterações
3. [commit] git add + git commit                     # ver skill git-commit
4. [push]   git push origin <branch>                 # push da branch
5. [PR]     github_create_pr                         # abrir PR
```

### Boas práticas para PRs

- **Título descritivo:** `feat(auth): Adiciona login com JWT` (mesmo padrão Conventional Commits)
- **Body explica o porquê:** contexto, motivação, o que mudou e por que
- **Base:** sempre `main` a menos que o usuário especifique outro destino
- **Draft:** usar quando PR está em progresso (WIP) — `draft: true`
- **Tamanho:** PRs pequenos e focados revisam melhor

### Exemplo de chamada da tool

```
github_create_pr
  title: "feat(api/orders): Adiciona rota GET /orders com paginação"
  body: "- Implementa endpoint de listagem de pedidos.
  - Suporte a paginação via query params page/limit.
  - Testes unitários para o handler.
  - Refs #25321"
  head: "feat/orders-25321"
  base: "main"
```

---

## Fluxo: Criar Issue

```
1. [buscar]   github_search          # verificar duplicatas
2. [criar]    github_create_issue    # title + body + labels
```

### Boas práticas para issues

- **Título claro:** `bug(login): Erro 500 ao autenticar com token expirado`
- **Body estruturado:**
  - **Bug:** Passos pra reproduzir, comportamento esperado vs real, ambiente
  - **Feature:** Contexto, solução proposta, alternativas consideradas
- **Labels:** usar para categorizar (bug, enhancement, docs, etc.)
- **Buscar antes:** sempre rodar `github_search` antes de criar — se existir duplicata, comentar na existente ao invés de criar nova

---

## Busca

- Antes de criar qualquer issue/PR, SEMPRE buscar por duplicatas primeiro
- Usar sintaxe de busca do GitHub: `"termo" repo:owner/name is:issue is:open`
- Resultados da busca incluem repo, número, título, estado e URL

---

## Integração com git-commit

- `git-commit` gerencia o commit local
- `github-flow` gerencia a publicação (push + PR)
- **Ordem correta:** commit → push → PR
- Extrair número da tarefa do branch para referência no commit e PR body: `- Refs #<numero>`

```
feat/orders-25321
  ↓ extrai
25321
  ↓
git commit -m "feat(orders): Adiciona rota GET /orders #25321"
  ↓
github_create_pr body: "... - Refs #25321"
```

---

## Limitações atuais

- Tools retornam resumo de PRs/issues (título, estado, autor, data, URL)
- Para ver corpo/detalhes completos, usar URL no browser ou `gh pr view`/`gh issue view` no bash
- Comando `/github` oferece fluxo interativo com editor de body e seletor de listas
