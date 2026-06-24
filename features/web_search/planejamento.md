# Web Search Extension — Plano de Implementação

> **Status:** Aguardando validação  
> **Sessão:** 2026-06-23  
> **Objetivo:** Extensão pi com 2 ferramentas (`web_search` + `web_fetch`) e skill associada para busca web via DuckDuckGo.

---

## 1. Visão Geral

```
┌──────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────────────────┐
│  LLM     │────▶│ web_search  │────▶│ 10 URLs  │────▶│ web_fetch (paralelo) │
│          │     │ POST DDG    │     │          │     │ GET cada URL         │
│  SKILL   │     │ 10 result.  │     │          │     │ extrai texto puro    │
│  orienta │     └─────────────┘     └──────────┘     │ salva em /tmp/...    │
└──────────┘                                          └──────────────────────┘
```

Fluxo:
1. LLM chama `web_search` (até 10x com queries diferentes) → acumula URLs
2. LLM chama `web_fetch` com lista de URLs → fetch paralelo (até 10 concorrentes)
3. Conteúdo extraído como texto puro → salvo em `/tmp/page_<YYYYMMDD>_<hash>/`
4. LLM lê arquivos salvos com `read` se necessário

---

## 2. Estrutura de Arquivos

```
~/.pi/agent/
├── extensions/web-search/
│   ├── package.json              # { "dependencies": { "cheerio": "^1.0.0" } }
│   ├── package-lock.json
│   ├── node_modules/             # gerado após npm install
│   │   └── cheerio/
│   ├── index.ts                  # entry point — registra 2 tools
│   ├── search.ts                 # web_search — POST DuckDuckGo + parse HTML
│   ├── fetch.ts                  # web_fetch — GET URL + extrair texto + salvar /tmp
│   └── utils.ts                  # UA pool, delay, headers, semáforo de concorrência
│
└── skills/web-search/
    └── SKILL.md                  # instruções para o LLM usar as tools
```

---

## 3. Ferramenta: `web_search`

### 3.1 Schema (TypeBox)

```typescript
parameters: Type.Object({
  query: Type.String({ description: "Search query terms" }),
})
```

Sem parâmetro `limit` — DuckDuckGo sempre retorna 10 resultados por padrão.

### 3.2 Endpoints

| Endpoint | Método | Parâmetros | Prioridade |
|----------|--------|------------|------------|
| `https://lite.duckduckgo.com/lite/` | POST | `q=<query>` | Primário |
| `https://html.duckduckgo.com/html` | POST | `q=<query>`, `b=` (vazio) | Fallback |

Estratégia: tentar lite primeiro. Se falhar (erro de rede, bloqueio), tentar html.

### 3.3 Parsing da Resposta (cheerio)

**`lite.duckduckgo.com/lite/`:**

O HTML da versão lite é uma tabela simples. Estrutura típica:
```html
<table>
  <tr>
    <td><a href="https://example.com">Título do Resultado</a></td>
  </tr>
  <tr>
    <td class="snippet">Descrição do resultado...</td>
  </tr>
  ...
</table>
```

Estratégia de parsing:
1. Selecionar todos os `<a>` dentro de `<td>` que apontam para URLs externas
2. Para cada link, buscar o snippet associado (próximo `<td>` com classe ou texto descritivo)
3. Filtrar links do próprio DuckDuckGo (anúncios, navegação interna)

**`html.duckduckgo.com/html`:**

HTML mais complexo com classes CSS. Estrutura típica:
```html
<div class="result">
  <a class="result__a" href="https://example.com">Título</a>
  <span class="result__snippet">Descrição...</span>
</div>
```

Estratégia de parsing:
1. Selecionar `.result` containers
2. Extrair `href` e texto do `.result__a`
3. Extrair texto do `.result__snippet`

### 3.4 Algoritmo

```
function web_search(query):
  1. Montar form data: { q: query }
  2. Tentar POST → lite.duckduckgo.com/lite/
     - User-Agent aleatório do pool
     - Headers: Content-Type: application/x-www-form-urlencoded
     - Timeout: 10s
     - Signal: ctx.signal (abort via Esc)
  3. Se sucesso (200):
     - Parse HTML com cheerio → extrair [{ title, url, snippet }]
     - Retornar até 10 resultados
  4. Se falha (rede, !=200):
     - Tentar POST → html.duckduckgo.com/html (mesmo form + b: "")
     - Parse com cheerio (seletores diferentes)
     - Retornar até 10 resultados
  5. Se ambas falharem:
     - Retornar erro descritivo no content
```

### 3.5 Retorno

```typescript
{
  content: [{
    type: "text",
    text: "Results for 'query':\n1. Title — https://url.com\n   Snippet...\n2. ..."
  }],
  details: {
    query: string,
    source: "lite" | "html",
    results: [{ title: string, url: string, snippet: string }]
  }
}
```

### 3.6 Tratamento de Erros

| Cenário | Ação |
|---------|------|
| Ambos endpoints retornam erro de rede | Retornar `isError: true` com mensagem |
| Ambos retornam HTTP 403/429 | Retornar erro: "DuckDuckGo bloqueou a requisição. Aguarde e tente novamente." |
| HTML malformado / 0 resultados | Retornar lista vazia com aviso |
| Timeout (10s) | Passar para fallback; se ambos timeout, retornar erro |
| Abort (Esc) | Respeitar `ctx.signal`, não retornar nada (promise reject é tratado pelo pi) |

---

## 4. Ferramenta: `web_fetch`

### 4.1 Schema (TypeBox)

```typescript
parameters: Type.Object({
  urls: Type.Array(Type.String(), { description: "List of URLs to fetch" }),
  maxConcurrent: Type.Optional(
    Type.Number({ description: "Max concurrent requests (default 10, max 10)" })
  ),
})
```

### 4.2 Algoritmo

```
function web_fetch(urls, maxConcurrent = 10):
  1. Gerar diretório de saída:
     dir = `/tmp/page_${YYYYMMDD}_${randomHex(8)}/`
     Exemplo: /tmp/page_20260623_a1b2c3d4/
  
  2. Criar diretório (fs.mkdir recursive)
  
  3. Processar URLs com concorrência controlada:
     - Semáforo de maxConcurrent workers
     - Cada worker:
       a) Aguardar delay aleatório (500ms — 2000ms)
       b) Selecionar User-Agent aleatório do pool
       c) GET <url> com headers (UA, Accept, Accept-Language)
       d) Timeout 15s por requisição
       e) Se sucesso (200, text/html):
          - Carregar HTML no cheerio
          - Remover <script>, <style>, <noscript>, <svg>, <nav>, <footer>
          - Extrair texto do <body>: $('body').text()
          - Limpar whitespace excessivo (regex: /\s+/g → " ")
          - Trim
       f) Salvar conteúdo em:
          /tmp/page_<date>_<hash>/<url_sanitizada>.txt
          (ex: https_example_com_page.txt)
       g) Registrar resultado: { url, file, status, size }
       h) Se falha: registrar erro, continuar próximas
  4. Retornar sumário
```

### 4.3 Concorrência — Implementação do Pool

Usar padrão de async pool sem dependências externas:

```typescript
async function asyncPool<T>(
  concurrency: number,
  items: T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>();
  
  for (const item of items) {
    const p = fn(item);
    executing.add(p);
    p.finally(() => executing.delete(p));
    
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  await Promise.all(executing);
}
```

- Cada item da fila já inclui o delay aleatório + UA aleatório
- Máximo 10 promises em voo simultaneamente
- Quando uma termina, a próxima da fila inicia

### 4.4 Sanitização de Nome de Arquivo

| URL | Nome do arquivo |
|-----|-----------------|
| `https://example.com/page?id=123` | `https_example_com_page_id_123.txt` |
| `https://en.wikipedia.org/wiki/Node.js` | `https_en_wikipedia_org_wiki_Node_js.txt` |
| `https://site.com/artigo` | `https_site_com_artigo.txt` |

Regras:
- Substituir `://` → `_`
- Substituir `/`, `?`, `=`, `&`, `#`, `.` (fora domínio) → `_`
- Colapsar múltiplos `_` → um só
- Truncar em 200 caracteres (máximo do sistema de arquivos)
- Adicionar sufixo numérico em caso de colisão (`_2`, `_3`...)

### 4.5 Pool de User-Agents

```typescript
const USER_AGENTS = [
  // Chrome — Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  // Chrome — macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  // Chrome — Linux
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  // Firefox — Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  // Firefox — macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
  // Firefox — Linux
  "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  // Safari — macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  // Edge — Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
];
```

Seleção aleatória a cada requisição — não sequencial, para evitar padrões detectáveis.

### 4.6 Headers HTTP

```typescript
{
  "User-Agent": "<aleatório do pool>",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",  // node-fetch gerencia automático
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
}
```

### 4.7 Extração de Texto com Cheerio

```typescript
function extractText(html: string): string {
  const $ = cheerio.load(html);
  
  // Remover elementos não-conteúdo
  $('script, style, noscript, svg, nav, footer, header, iframe, [role="navigation"]').remove();
  
  // Extrair texto do body; fallback para documento inteiro
  const body = $('body').length ? $('body') : $.root();
  let text = body.text();
  
  // Normalizar whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}
```

### 4.8 Retorno

```typescript
{
  content: [{
    type: "text",
    text: `Fetched 10 URLs. Saved to /tmp/page_20260623_a1b2c3d4/
- https://example.com → https_example_com.txt (45.2 KB)
- https://site.org → https_site_org.txt (12.8 KB)
...
Errors: 0`
  }],
  details: {
    outputDir: "/tmp/page_20260623_a1b2c3d4",
    total: 10,
    succeeded: 10,
    failed: 0,
    results: [
      { url: "https://...", file: "...txt", size: 45200, status: 200 },
      { url: "https://...", error: "ETIMEDOUT" },
    ]
  }
}
```

### 4.9 Tratamento de Erros

| Cenário | Ação |
|---------|------|
| URL inalcançável (DNS, rede) | Registrar erro, continuar próximas |
| HTTP != 200 | Registrar status code, continuar |
| Timeout (15s) | Registrar "TIMEOUT", continuar |
| Conteúdo não-HTML (`Content-Type` != `text/html`) | Pular, registrar "NOT_HTML" |
| Falha ao criar diretório `/tmp` | Retornar erro imediatamente (sem /tmp = sem salvage) |
| Falha ao escrever arquivo | Registrar erro de IO, continuar |
| Abort (Esc via `ctx.signal`) | Interromper workers pendentes, retornar resultados parciais |

---

## 5. SKILL.md

### 5.1 Localização

`~/.pi/agent/skills/web-search/SKILL.md`

### 5.2 Conteúdo

```markdown
---
name: web-search
description: Search the web via DuckDuckGo and fetch full page content. Use when you need up-to-date information, documentation, facts, or any web research that requires current data beyond your knowledge cutoff. Always prefers web_search for search and web_fetch for content extraction.
---

# Web Search

## When to Use

Use this skill when:
- User asks about current events, recent updates, or time-sensitive information
- You need to look up documentation, API references, or technical specs
- User requests web research on any topic
- Your training data may be outdated for the query

## Tools

Two tools work together:

### `web_search` — Find URLs

Searches DuckDuckGo and returns up to 10 results (title, URL, snippet).

- Call with different queries to gather diverse sources
- You may call up to 10 times per research session
- Combine results before calling `web_fetch`

### `web_fetch` — Extract Content

Fetches full page content from a list of URLs, extracting clean text.

- Pass all collected URLs in a single call
- Fetches up to 10 URLs in parallel (with automatic queueing)
- Content saved to `/tmp/page_<date>_<hash>/<sanitized_url>.txt`
- Use `read` to access saved files

## Workflow

1. **Search**: Call `web_search` with the user's query
2. **Evaluate**: Review results — if more/different sources needed, call `web_search` again with refined query
3. **Fetch**: Call `web_fetch` with all collected URLs
4. **Read**: Use `read` on the saved files to get full content
5. **Answer**: Synthesize findings and respond to the user

## Best Practices

- Use specific, targeted queries rather than broad ones
- Diversify sources: prefer calling `web_search` 2-3 times with different angles over 1 broad query
- Always fetch before citing — snippets can be misleading
- Report errors transparently: "3 pages failed to load, but here's what I found from the other 7"
```

---

## 6. Dependências

### 6.1 `package.json`

```json
{
  "name": "web-search-extension",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "cheerio": "^1.0.0"
  },
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

### 6.2 Instalação

```bash
cd ~/.pi/agent/extensions/web-search
npm install
```

Após `npm install`, o pi descobre automaticamente a extensão via `pi.extensions` no `package.json`.

---

## 7. Utilitários (`utils.ts`)

### 7.1 Funções exportadas

| Função | Descrição |
|--------|-----------|
| `randomUserAgent()` | Retorna UA aleatório do pool |
| `randomDelay(min, max)` | Retorna `Promise<void>` que resolve após delay aleatório |
| `sanitizeFilename(url)` | Converte URL em nome de arquivo seguro |
| `asyncPool(concurrency, items, fn)` | Processa array com concorrência controlada |

### 7.2 Constantes exportadas

| Constante | Valor |
|-----------|-------|
| `USER_AGENTS` | `string[]` — 8 UAs |
| `MIN_DELAY_MS` | `500` |
| `MAX_DELAY_MS` | `2000` |
| `SEARCH_TIMEOUT_MS` | `10_000` |
| `FETCH_TIMEOUT_MS` | `15_000` |
| `DEFAULT_CONCURRENCY` | `10` |

---

## 8. Tratamento de Sinais (Abort)

Todas as operações de rede usam `ctx.signal` (passado como parâmetro `signal` no `execute` da tool):

```typescript
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  const response = await fetch(url, {
    signal: signal ?? ctx.signal,  // abort do pi + abort da tool
    // ...
  });
}
```

Comportamento esperado:
- Usuário pressiona `Esc` → `ctx.signal` é aborted
- `fetch` lança `AbortError`
- Tool retorna resultado parcial (se `web_fetch`) ou erro limpo (se `web_search`)

---

## 9. Ordem de Implementação

| # | Arquivo | Descrição | Depende de |
|---|---------|-----------|------------|
| 1 | `package.json` | Dependências e metadata | — |
| 2 | `utils.ts` | UA pool, delay, asyncPool, sanitize | — |
| 3 | `search.ts` | `web_search` — POST DDG + parse | `utils.ts` |
| 4 | `fetch.ts` | `web_fetch` — GET páginas + extrair + salvar | `utils.ts` |
| 5 | `index.ts` | Entry point — registra as 2 tools | `search.ts`, `fetch.ts` |
| 6 | `skills/web-search/SKILL.md` | Instruções para o LLM | — |
| 7 | `npm install` | Instalar cheerio | `package.json` |
| 8 | Teste manual | Validar fluxo completo no pi | Todos |

---

## 10. Critérios de Verificação

### `web_search`
- [ ] Chamar `web_search("node.js best practices")` retorna 10 resultados com title, url, snippet
- [ ] Fallback de `lite` → `html` funciona se lite falhar
- [ ] Erro de rede retorna mensagem clara (não crasha)
- [ ] `Esc` durante a busca aborta corretamente

### `web_fetch`
- [ ] Chamar com 10 URLs → todas processadas, arquivos criados em `/tmp/page_<date>_<hash>/`
- [ ] Delay aleatório aplicado por requisição (visível no log de timestamps)
- [ ] User-Agent varia entre requisições (verificar nos arquivos de log)
- [ ] Arquivos contêm texto puro (sem tags HTML, scripts, estilos)
- [ ] URLs com erro não interrompem as demais (continua processando)
- [ ] Com 25 URLs → 10 concorrentes, 15 em fila, todas processadas
- [ ] `Esc` aborta workers pendentes e retorna parciais

### SKILL.md
- [ ] Frontmatter válido (name, description)
- [ ] LLM consegue identificar quando usar a skill
- [ ] Instruções de workflow claras

### Integração
- [ ] Extensão carrega sem erros no startup do pi
- [ ] Ambas tools aparecem na lista de tools disponíveis
- [ ] Fluxo completo: `web_search` → `web_fetch` → `read` nos arquivos salvos

---

## 11. Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| DuckDuckGo mudar HTML/layout | Média | Alto | Monitorar parsing; usar fallback entre endpoints |
| Bloqueio por rate limiting | Média | Médio | UA rotativo + delays; mensagem clara de erro |
| Páginas com charset inválido | Baixa | Baixo | `TextDecoder` com fallback para UTF-8/latin1 |
| `/tmp` sem permissão de escrita | Baixa | Alto | Verificar e retornar erro claro |
| Páginas muito grandes (centenas de MB) | Baixa | Médio | Sem limite por decisão do usuário; risco aceito |
