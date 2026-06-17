# Pi.dev — Themes

> Fonte: https://pi.dev/docs/latest/themes
> Gerado em: 2026-06-16

---

## Sumário

1. [Conceito](#conceito)
2. [Locais de Descoberta](#1-locais-de-descoberta)
3. [Selecionar Theme](#2-selecionar-theme)
4. [Criar Custom Theme](#3-criar-custom-theme)
5. [Formato do Theme](#4-formato-do-theme)
6. [51 Color Tokens Obrigatórios](#5-51-color-tokens-obrigatórios)
7. [Valores de Cor](#6-valores-de-cor)
8. [Terminal Compatibility](#7-terminal-compatibility)
9. [Dicas](#8-dicas)
10. [Exemplos](#9-exemplos)

---

## Conceito

Themes são arquivos **JSON** que definem cores do TUI. **51 tokens obrigatórios** — não há tokens opcionais. Qualquer token omitido impede o carregamento do theme.

---

## 1. Locais de Descoberta

| Local | Escopo |
|-------|--------|
| Built-in: `dark`, `light` | Sempre disponíveis |
| `~/.pi/agent/themes/*.json` | Global |
| `.pi/themes/*.json` | Projeto (após trust) |
| `themes/` em packages | Package (`package.json → pi.themes`) |
| `settings.json → "themes": [...files ou dirs]` | Config |
| `--theme <path>` (CLI, repetível) | Sessão |

**Desabilitar:** `--no-themes`.

---

## 2. Selecionar Theme

Via UI interativa:
```
/settings
```

Ou em `settings.json`:
```json
{
  "theme": "my-theme"
}
```

Na primeira execução, o pi detecta o background do terminal e usa `dark` ou `light` automaticamente.

---

## 3. Criar Custom Theme

```bash
mkdir -p ~/.pi/agent/themes
vim ~/.pi/agent/themes/my-theme.json
```

**Hot reload:** Editar o arquivo do theme ativo enquanto o pi está rodando recarrega automaticamente com feedback visual imediato.

---

## 4. Formato do Theme

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": {
    "blue": "#0066cc",
    "gray": 242
  },
  "colors": {
    "accent": "blue",
    "border": "blue",
    "borderAccent": "#00ffff",
    "borderMuted": "gray",
    "success": "#00ff00",
    "error": "#ff0000",
    "warning": "#ffff00",
    "muted": "gray",
    "dim": 240,
    "text": "",
    "thinkingText": "gray",
    "selectedBg": "#2d2d30",
    "userMessageBg": "#2d2d30",
    "userMessageText": "",
    "customMessageBg": "#2d2d30",
    "customMessageText": "",
    "customMessageLabel": "blue",
    "toolPendingBg": "#1e1e2e",
    "toolSuccessBg": "#1e2e1e",
    "toolErrorBg": "#2e1e1e",
    "toolTitle": "blue",
    "toolOutput": "",
    "mdHeading": "#ffaa00",
    "mdLink": "blue",
    "mdLinkUrl": "gray",
    "mdCode": "#00ffff",
    "mdCodeBlock": "",
    "mdCodeBlockBorder": "gray",
    "mdQuote": "gray",
    "mdQuoteBorder": "gray",
    "mdHr": "gray",
    "mdListBullet": "#00ffff",
    "toolDiffAdded": "#00ff00",
    "toolDiffRemoved": "#ff0000",
    "toolDiffContext": "gray",
    "syntaxComment": "gray",
    "syntaxKeyword": "blue",
    "syntaxFunction": "#00aaff",
    "syntaxVariable": "#ffaa00",
    "syntaxString": "#00ff00",
    "syntaxNumber": "#ff00ff",
    "syntaxType": "#00aaff",
    "syntaxOperator": "blue",
    "syntaxPunctuation": "gray",
    "thinkingOff": "gray",
    "thinkingMinimal": "blue",
    "thinkingLow": "#00aaff",
    "thinkingMedium": "#00ffff",
    "thinkingHigh": "#ff00ff",
    "thinkingXhigh": "#ff0000",
    "bashMode": "#ffaa00"
  },
  "export": {
    "pageBg": "#18181e",
    "cardBg": "#1e1e24",
    "infoBg": "#3c3728"
  }
}
```

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `name` | Sim | Nome único do theme |
| `$schema` | Não | Schema para autocomplete e validação no editor |
| `vars` | Não | Cores reutilizáveis (definir aqui, referenciar em `colors`) |
| `colors` | **Sim** | Todos os 51 tokens obrigatórios |
| `export` | Não | Cores para `/export` HTML. Se omitido, derivado de `userMessageBg` |

---

## 5. 51 Color Tokens Obrigatórios

### Core UI (11)

| Token | Purpose |
|-------|---------|
| `accent` | Primary accent (logo, selected items, cursor) |
| `border` | Bordas normais |
| `borderAccent` | Bordas destacadas |
| `borderMuted` | Bordas sutis (editor) |
| `success` | Estados de sucesso |
| `error` | Estados de erro |
| `warning` | Estados de warning |
| `muted` | Texto secundário |
| `dim` | Texto terciário |
| `text` | Texto padrão (geralmente `""` para usar a cor default do terminal) |
| `thinkingText` | Texto do bloco thinking |

### Backgrounds & Content (11)

| Token | Purpose |
|-------|---------|
| `selectedBg` | Background da linha selecionada |
| `userMessageBg` | Background da mensagem do usuário |
| `userMessageText` | Texto da mensagem do usuário |
| `customMessageBg` | Background de mensagem de extension |
| `customMessageText` | Texto de mensagem de extension |
| `customMessageLabel` | Label de mensagem de extension |
| `toolPendingBg` | Tool box em estado pending |
| `toolSuccessBg` | Tool box em estado success |
| `toolErrorBg` | Tool box em estado error |
| `toolTitle` | Título da tool |
| `toolOutput` | Texto do output da tool |

### Markdown (10)

| Token | Purpose |
|-------|---------|
| `mdHeading` | Headings |
| `mdLink` | Texto do link |
| `mdLinkUrl` | URL do link |
| `mdCode` | Código inline |
| `mdCodeBlock` | Conteúdo do code block |
| `mdCodeBlockBorder` | Fences do code block |
| `mdQuote` | Texto do blockquote |
| `mdQuoteBorder` | Borda do blockquote |
| `mdHr` | Linha horizontal |
| `mdListBullet` | Bullets de lista |

### Tool Diffs (3)

| Token | Purpose |
|-------|---------|
| `toolDiffAdded` | Linhas adicionadas |
| `toolDiffRemoved` | Linhas removidas |
| `toolDiffContext` | Linhas de contexto |

### Syntax Highlighting (9)

| Token | Purpose |
|-------|---------|
| `syntaxComment` | Comentários |
| `syntaxKeyword` | Keywords |
| `syntaxFunction` | Nomes de função |
| `syntaxVariable` | Variáveis |
| `syntaxString` | Strings |
| `syntaxNumber` | Números |
| `syntaxType` | Tipos |
| `syntaxOperator` | Operadores |
| `syntaxPunctuation` | Pontuação |

### Thinking Level Borders (6)

Cores da borda do editor conforme o nível de thinking (hierarquia visual do sutil ao proeminente):

| Token | Purpose |
|-------|---------|
| `thinkingOff` | Thinking desligado |
| `thinkingMinimal` | Minimal thinking |
| `thinkingLow` | Low thinking |
| `thinkingMedium` | Medium thinking |
| `thinkingHigh` | High thinking |
| `thinkingXhigh` | Extra high thinking |

### Bash Mode (1)

| Token | Purpose |
|-------|---------|
| `bashMode` | Borda do editor em modo bash (prefixo `!`) |

---

## 6. Valores de Cor

Quatro formatos suportados:

| Formato | Exemplo | Descrição |
|---------|---------|-----------|
| **Hex** | `"#ff0000"` | RGB de 6 dígitos |
| **256-color** | `39` | Índice da xterm 256-color palette (0-255) |
| **Variable** | `"blue"` | Referência a uma entrada em `vars` |
| **Default** | `""` | Cor padrão do terminal |

### 256-Color Palette

- **0-15**: Cores ANSI básicas (dependente do terminal)
- **16-231**: Cubo RGB 6×6×6 (`16 + 36×R + 6×G + B`, onde R,G,B são 0-5)
- **232-255**: Rampa de escala de cinza

---

## 7. Terminal Compatibility

Pi usa **24-bit RGB colors**. A maioria dos terminais modernos suporta:

- iTerm2
- Kitty
- WezTerm
- Windows Terminal
- VS Code integrated terminal

Para terminais legados com apenas 256 cores, o pi faz fallback para a aproximação mais próxima.

Verificar suporte a truecolor:
```bash
echo $COLORTERM
# Deve retornar "truecolor" ou "24bit"
```

---

## 8. Dicas

- **Dark terminals:** Use cores brilhantes, saturadas e alto contraste
- **Light terminals:** Use cores escuras, muted e baixo contraste
- **Harmonia:** Comece com uma paleta base (Nord, Gruvbox, Tokyo Night), defina em `vars` e referencie consistentemente
- **Teste:** Verifique o theme com diferentes tipos de mensagem, estados de tool, conteúdo markdown e texto longo com wrapping
- **VS Code:** Defina `terminal.integrated.minimumContrastRatio` como `1` para cores precisas

---

## 9. Exemplos

Ver os built-in themes no source do pi:

- [dark.json](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/theme/dark.json)
- [light.json](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/theme/light.json)