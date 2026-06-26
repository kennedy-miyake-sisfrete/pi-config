---
name: git-commit
description: Faz commits semânticos seguindo Conventional Commits com formato padronizado. Extrai número da tarefa do branch atual. Use ao finalizar qualquer tarefa ou sessão de desenvolvimento.
---

# Git Commit

## Formato

```
tipo(escopo): Título descritivo em PT-BR

- Bullet com cada alteração importante.
- Outra alteração importante.
- Refs #<numero-tarefa> (se aplicável)
```

Onde:
- `tipo` — um dos tipos abaixo
- `escopo` — arquivo/diretório principal alterado (ex.: `auth`, `api/orders`, `docker-compose.yml`)
- `título` — ≤ 72 caracteres, imperativo, descreve **o que** mudou, **em PT-BR**
- `corpo` — **obrigatório** como bullet list. Cada bullet = uma alteração atômica. Explica **o que** foi feito (o diff já mostra o código; os bullets organizam as mudanças).

### Extração do número da tarefa

O branch atual contém o número da tarefa no final. Extraia automaticamente:

```bash
git branch --show-current | grep -oE '[0-9]+$|[a-zA-Z]+[0-9]+$'
```

Exemplos:
| Branch | Número extraído |
|--------|----------------|
| `feat/auth-25321` | `25321` |
| `fix/payment-dsccw4` | `dsccw4` |
| `refactor/api-112` | `112` |

O número extraído **não** vai no título do commit. Use apenas para referência na descrição quando necessário (ex.: "Refs #25321").

## Tipos

| Tipo | Uso |
|------|-----|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Documentação |
| `style` | Formatação, espaços, ponto-e-vírgula |
| `refactor` | Refatoração sem mudar comportamento |
| `perf` | Melhoria de performance |
| `test` | Testes |
| `build` | Build, dependências, CI |
| `ci` | Configuração de CI |
| `chore` | Tarefas de manutenção |
| `revert` | Reversão de commit |

## Boas práticas

- **Título ≤ 72 caracteres.** Sempre.
- **Imperativo.** "Adiciona rota de login", não "Adicionou" nem "Adicionado".
- **Corpo explica o porquê.** O diff já mostra o que mudou. O corpo responde *por que* mudou daquela forma.
- **Um commit = uma mudança atômica.** Não misture refactor com feat no mesmo commit. Se precisar refatorar para implementar uma feat, faça dois commits: primeiro o refactor, depois a feat.
- **Secrets nunca.** Revise o diff antes de commitar. Nada de .env, tokens, node_modules.
- **PT-BR obrigatório.** Título e corpo do commit em português brasileiro.
- **Corpo em bullet list.** Descrição sempre em formato de bullet list (`- `). Cada bullet = uma alteração importante. Ordem cronológica ou lógica. **Sem linha em branco entre bullets** — usar um único `-m` com quebras de linha.
- **Sem push sem autorização.** Nunca execute `git push`. Só faça push se o usuário solicitar explicitamente.
- **Surgical Changes.** Toda linha alterada serve ao requisito. Se notar dead code não relacionado, mencione — não comite junto.
- **Revise antes de commitar.** Sempre rode `git diff --cached` antes de commitar.

## Protocolo de proteção

### 1. Verificar branch

```bash
BRANCH=$(git branch --show-current)
```

- Se for `main` ou `master`, **nunca commitar diretamente**. Criar branch feature:
  ```bash
  git checkout -b feat/descricao-<numero>
  ```
  E commitar lá.

### 2. Verificar o staged

```bash
git status
```

- Só devem estar staged os arquivos do escopo da tarefa.
- Se houver arquivos não relacionados, pergunte antes de incluir ou remova do stage:
  ```bash
  git restore --staged <arquivo-fora-do-escopo>
  ```
- **Nunca** adicione ao stage arquivos que não foram modificados na requisição atual,
  mesmo que estejam modified/untracked no `git status`. Eles são mudanças pré-existentes
  e não pertencem a este commit.

### 3. Verificar whitespace errors

```bash
git diff --check
```

### 4. Commitar

Usar um único `-m` para o corpo, com quebras de linha entre os bullets (sem linha em branco):

```bash
git commit \
  -m "tipo(escopo): Título descritivo em PT-BR" \
  -m "- Bullet com alteração 1.
- Bullet com alteração 2.
- Refs #<numero-tarefa>"
```

Exemplo real:

```bash
git commit \
  -m "feat(auth): Adiciona rota de login com JWT" \
  -m "- Implementa POST /auth/login com validação de credenciais.
- Gera token JWT com expiração de 24h.
- Adiciona middleware de verificação de token.
- Refs #25321"
```

### 5. Verificar push

```bash
BRANCH=$(git branch --show-current)
```

- **Nunca** fazer `git push` para `main` ou `master` diretamente.
- **Nunca** executar `git push` sem solicitação explícita do usuário. O commit é o fim do fluxo; push é decisão do usuário.
- Se estiver em branch feature, push só deve ir para `origin/<mesma-branch>`:
  ```bash
  git push origin "$BRANCH"
  ```
- Para mergear em `main`/`master`, usar Pull Request / Merge Request na plataforma.

## Fluxo completo

```
1. git status                          # ver o estado geral
2. git add <arquivos-do-escopo>       # stage cirúrgico
3. git status                          # conferir staged
4. git diff --cached                   # revisar o diff
5. git diff --check                    # whitespace
6. git commit -m "tipo(escopo): msg" -m "- bullet 1.\n- bullet 2."  # corpo bullet list, sem linha em branco
7. [somente se solicitado] git push    # nunca sem autorização explícita
```
