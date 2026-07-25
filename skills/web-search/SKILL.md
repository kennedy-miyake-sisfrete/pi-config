---
name: web-search
description: Pesquisa na web via SearXNG (local), Tavily, Exa ou Serper.dev e extrai conteúdo completo de páginas. Use quando precisar de informações atuais além do treinamento, fatos em tempo real, consulta a documentações ou qualquer pesquisa web. Sempre prefere web_search para encontrar URLs e web_fetch para extrair conteúdo.
---

# Web Search

## Quando usar

Use esta skill quando o usuário perguntar sobre:
- Eventos atuais, notícias recentes ou tópicos sensíveis a tempo
- Documentação mais recente, referências de API ou especificações técnicas
- Fatos ou dados que podem ter mudado após sua data de treinamento
- Qualquer tarefa de pesquisa web que exija informações atualizadas

## Ferramentas

Três ferramentas trabalham juntas:

### `web_agent` — Orquestrar Pesquisa Multi-Ramo

Inicia uma sessão de pesquisa. Chame **primeiro** com um objetivo estratégico.

- **Parâmetro:** `goal` (string, opcional) — objetivo da pesquisa. Omita para consultar o estado atual da sessão.
- **Auto-tracking:** Monitora chamadas `web_search` e `web_fetch`, mantendo o estado da sessão automaticamente.
- **Persistência de estado:** Mesmo objetivo reusa estado acumulado; novo objetivo reseta a sessão.
- **Saída:** Cabeçalho da pesquisa com buscas realizadas, URLs descobertas, páginas extraídas e sugestões contextuais.

### `web_search` — Encontrar URLs

Pesquisa via cascata de mecanismos: **SearXNG (local)** → Tavily → Exa → Serper.dev.
Retorna até 10 resultados com título e URL. Cada mecanismo é tentado em ordem; se um falha, o próximo é usado.

- **Parâmetro:** `query` (string) — os termos de busca
- **Cascata:** SearXNG (auto-hospedado, gratuito, sem API key) → Tavily → Exa → Serper.dev
- **Config:** Chaves de API definidas via `/web_search config <provedor> <chave>` ou env vars (`SERPER_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`). SearXNG não precisa de chave.
- **Sem limite fixo de chamadas** — use estrategicamente, evite consultas redundantes em excesso

#### SearXNG (local, Docker)

SearXNG é um meta-mecanismo de busca auto-hospedado que agrega múltiplas fontes. Roda localmente via Docker:

```bash
cd /caminho/do/pi-web-search
docker compose up -d      # sobe na porta 8080
docker compose down       # derruba quando quiser
```

Configuração opcional via env var `SEARXNG_URL` ou `/web_search config searxng <url>`.
Padrão: `http://localhost:8080`.

### `web_fetch` — Extrair Conteúdo

Busca o conteúdo completo de uma lista de URLs, remove HTML/scripts/navegação e salva texto limpo em disco.

- **Parâmetro:** `urls` (string[]) — passe todas as URLs coletadas em uma chamada
- **Concorrência:** Processa até **10 URLs em paralelo**; URLs excedentes são enfileiradas automaticamente
- **Saída:** Cada página salva em `/tmp/page_<YYYYMMDD>_<random>/<url-sanitizada>.txt`
- **Throttling:** Cada requisição usa um User-Agent aleatório + delay aleatório de 500–2000ms
- **Limites:** Timeout de 15s por URL; tipos de conteúdo não-HTML são ignorados

## Fluxo de trabalho

### Fluxo de Pesquisa Multi-Ramo (recomendado)

Para tópicos de pesquisa complexos ou amplos, use `web_agent` para orquestrar múltiplas buscas e extrações:

```
1. PLANEJAR  → web_agent({ goal: "..." })    ← inicia sessão, retorna sugestões
2. BUSCAR    → web_search(consulta1)          ← LLM cria consultas a partir das sugestões
3. BUSCAR    → web_search(consulta2)          ← múltiplos ramos
4. BUSCAR    → web_search(consultaN)
5. AVALIAR   → web_agent({})                  ← consulta estado atualizado
6. EXTRAIR   → web_fetch([url1, url2, ...])   ← extrai URLs descobertas
7. AVALIAR   → web_agent({})                  ← consulta estado atualizado novamente
8. REPETIR   → loop passos 2–7 até satisfatório
9. RESPONDER → sintetizar descobertas
```

### Fluxo Rápido (tópico único)

Para consultas simples e focadas onde uma única busca é suficiente:

```
1. BUSCAR    → web_search(consulta)
2. EXTRAIR   → web_fetch([url1, url2, ...])
3. LER       → read /tmp/page_<data>_<hash>/...
4. RESPONDER → sintetizar descobertas
```

## Passo a passo (Multi-Ramo)

1. **Chame `web_agent`** com um `goal` estratégico de pesquisa. Analise as sugestões para consultas iniciais.
2. **Chame `web_search`** várias vezes com consultas diferentes para cobrir diferentes ângulos do objetivo.
3. **Chame `web_agent`** (sem goal) para verificar quais URLs foram descobertas e ainda não extraídas.
4. **Chame `web_fetch`** com as URLs descobertas para obter o conteúdo completo das páginas.
5. **Chame `web_agent`** novamente para verificar o progresso. Repita busca/extração conforme necessário.
6. Quando `web_agent` sugerir "Research complete — summarize findings", sintetize e responda.

## Boas práticas

- **Sempre inicie pesquisas complexas com `web_agent`.** Deixe ele rastrear seu progresso automaticamente.
- **Chame `web_agent` (sem goal) entre passos** para verificar URLs descobertas e sugestões.
- **Diversifique consultas.** Use as sugestões do `web_agent` para cobrir diferentes ângulos.
- **Extraia antes de citar.** Trechos podem enganar. Sempre chame `web_fetch` em URLs importantes.
- **Reporte erros com transparência.** Se algumas URLs falharam, diga: "Encontrei 10 resultados mas apenas 8 carregaram."
- **Use `read` para acessar arquivos salvos.** O diretório de saída é mostrado na resposta do `web_fetch`.
- **SearXNG local é preferencial** — sem taxa, sem API key. Só precisa do Docker rodando.

## Exemplo (Multi-Ramo)

```
Usuário: Quais são as melhores ferramentas CLI para desenvolvedores aumentarem produtividade?

Agent:
1. web_agent({ "goal": "Encontrar melhores ferramentas CLI de produtividade para devs 2024/2025" })
   → ## 🧠 Pesquisa: "..."
      ### Buscas (0)
      ### Sugestões
      - Divida o objetivo em consultas de busca específicas
      - Comece chamando web_search com termos direcionados

2. web_search("melhores ferramentas CLI produtividade desenvolvedores 2025")
   → 10 resultados (SearXNG)

3. web_search("substitutos modernos Unix ls cat grep find")
   → 10 resultados (SearXNG)

4. web_search("utilitarios CLI dev git helpers teste API")
   → 8 resultados (SearXNG)

5. web_agent({})
   → ### Buscas (3)
     ✅ "melhores ferramentas CLI..." → 10 resultados
     ✅ "substitutos modernos Unix..." → 10 resultados
     ✅ "utilitarios CLI dev..." → 8 resultados
     ### URLs Descobertas (15 não extraídas ainda)
       🔗 https://github.com/...
       🔗 https://dev.to/...
       ...
     ### Sugestões
       - web_fetch 15 URLs descobertas para obter conteúdo

6. web_fetch(["https://github.com/...", "https://dev.to/...", ...])
   → Extraídas 15 URLs → /tmp/page_20260625_a1b2c3d4/

7. web_agent({})
   → ### Páginas Extraídas (15)
     ✅ https://github.com/... → arquivo (12.3 KB)
     ❌ https://broken.com/... → ENOTFOUND
     ### Sugestões
       - 1 página(s) falharam — verifique erros de digitação ou acesso

8. web_agent({ "goal": "Encontrar dados de benchmark para essas ferramentas CLI" })
   → Objetivo refinado, novo ciclo de pesquisa começa

9. web_search("benchmark ferramentas CLI performance 2025")
   → ...
```

## Exemplo (Fluxo Rápido)

```
Usuário: Qual é a versão atual do Python?

Agent:
1. web_search("versao atual Python 2025")
   → 10 resultados (SearXNG)

2. web_fetch(["https://python.org/downloads/"])
   → Extraída 1 URL → /tmp/page_20260625_x1y2z3/

3. read /tmp/page_20260625_x1y2z3/https_python_org_downloads.txt
   → "Python 3.13.3"

4. Resposta: A versão atual do Python é 3.13.3.
```
