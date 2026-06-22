---
name: git-commit
description: Faz commits semânticos seguindo Conventional Commits com formato padronizado. Extrai número da tarefa do branch atual. Use ao finalizar qualquer tarefa ou sessão de desenvolvimento.
---

# Git Commit

## Formato

```
tipo(escopo): título descritivo

Corpo opcional — explica o porquê, não o quê.
```

Onde:
- `tipo` — um dos tipos abaixo
- `escopo` — arquivo/diretório principal alterado (ex.: `auth`, `api/orders`, `docker-compose.yml`)
- `título` — ≤ 72 caracteres, imperativo, descreve **o que** mudou
- `corpo` — opcional, explica **por que** mudou (o diff já mostra o quê)

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

### 3. Verificar whitespace errors

```bash
git diff --check
```

### 4. Commitar

```bash
git commit -m "tipo(escopo): título descritivo"
```

Se precisar de corpo:

```bash
git commit -m "tipo(escopo): título descritivo" -m "Corpo explicando o porquê da mudança. Refs #<numero-tarefa>"
```

## Fluxo completo

```
1. git status                          # ver o estado geral
2. git add <arquivos-do-escopo>       # stage cirúrgico
3. git status                          # conferir staged
4. git diff --cached                   # revisar o diff
5. git diff --check                    # whitespace
6. git commit -m "tipo(escopo): msg"   # commitar
```
