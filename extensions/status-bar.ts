import { CustomEditor, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import path from "node:path";

class ModelInfoEditor extends CustomEditor {
  private uiTheme: Theme;
  private modelId = "unknown";
  private provider = "";
  private thinking = "off";
  private sessionTokens = 0;
  private sessionCost = 0;
  private lastInput = 0;
  private lastOutput = 0;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    uiTheme: Theme,
  ) {
    super(tui, theme, keybindings, { paddingX: 0 });
    this.uiTheme = uiTheme;
    this.borderColor = (text: string) => uiTheme.fg("border", text);
  }

  setModelInfo(id: string, provider: string, thinking: string) {
    this.modelId = id;
    this.provider = provider;
    this.thinking = thinking;
    this.invalidate();
  }

  setTokenInfo(input: number, output: number, total: number, cost: number) {
    this.lastInput = input;
    this.lastOutput = output;
    this.sessionTokens = total;
    this.sessionCost = cost;
    this.invalidate();
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (width <= 4) return lines;

    const content = lines.length >= 3 ? lines.slice(1, -1) : lines;

    const borderFg = this.uiTheme.fg.bind(this.uiTheme, "border");
    const mutedFg = this.uiTheme.fg.bind(this.uiTheme, "borderMuted");
    const dimFg = this.uiTheme.fg.bind(this.uiTheme, "dim");

    const rail = borderFg("│ ");
    const railW = 2;
    const innerW = Math.max(1, width - railW);

    const fill = (s: string) => {
      const t = truncateToWidth(s, Math.max(0, innerW), "");
      return t + " ".repeat(Math.max(0, innerW - visibleWidth(t)));
    };

    const modelInfo = [
      borderFg(this.modelId),
      this.provider ? " " + this.uiTheme.fg("muted", this.provider) : "",
      " " + this.uiTheme.fg("dim", this.thinking),
    ].join("");

    const tokenInfo = dimFg(`↑ ${this.lastInput}/${this.lastOutput} ↓ ${this.sessionTokens} $${this.sessionCost.toFixed(4)}`);

    const topBorder = mutedFg("─".repeat(width));
    const bottomBorder = mutedFg("─".repeat(width));
    const paddedContent = content.map((line) => rail + fill(line));
    const spacer = rail + fill("");

    const leftPart = modelInfo;
    const rightPart = tokenInfo;
    const leftW = visibleWidth(leftPart);
    const rightW = visibleWidth(rightPart);
    const gap = Math.max(1, innerW - leftW - rightW);
    const metaLine = rail + leftPart + " ".repeat(gap) + rightPart;

    return [topBorder, ...paddedContent, spacer, metaLine, bottomBorder];
  }
}

export default function (pi: ExtensionAPI) {
  let currentThinking: string = "off";
  let editorRef: ModelInfoEditor | null = null;
  let sessionTokens = 0;
  let sessionCost = 0;

  pi.on("session_start", async (_event, ctx) => {
    const folderName = path.basename(ctx.cwd);
    currentThinking = pi.getThinkingLevel() || "off";

    // Calculate existing session totals from entries
    const entries = ctx.sessionManager.getEntries();
    sessionTokens = 0;
    sessionCost = 0;
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "assistant" && entry.message.usage) {
        sessionTokens += entry.message.usage.totalTokens;
        sessionCost += entry.message.usage.cost.total;
      }
    }

    const modelId = ctx.model?.id || "unknown";
    const provider = ctx.model?.provider || "";

    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
      const editor = new ModelInfoEditor(tui, theme, keybindings, ctx.ui.theme);
      editorRef = editor;
      editor.setModelInfo(modelId, provider, currentThinking);
      editor.setTokenInfo(0, 0, sessionTokens, sessionCost);
      return editor;
    });

    ctx.ui.setFooter((tui, theme, footerData) => {
      const renderLine = (width: number): string[] => {
        const branch = footerData.getGitBranch() || "no-branch";
        const line = [
          theme.fg("accent", "\u{f07c}"),
          theme.fg("accent", " " + folderName),
          theme.fg("muted", " on "),
          theme.fg("borderAccent", branch),
          theme.fg("warning", " \u{3bb}"),
        ].join("");
        return [line];
      };

      return {
        render: renderLine,
        invalidate() {},
        dispose: footerData.onBranchChange(() => tui.requestRender()),
      };
    });
  });

  pi.on("thinking_level_select", async (event, ctx) => {
    currentThinking = event.level;
    editorRef?.setModelInfo(
      ctx.model?.id || "unknown",
      ctx.model?.provider || "",
      currentThinking,
    );
  });

  pi.on("model_select", async (event, ctx) => {
    editorRef?.setModelInfo(
      event.model.id,
      event.model.provider || "",
      currentThinking,
    );
  });

  pi.on("message_end", async (event, _ctx) => {
    if (event.message.role === "assistant" && event.message.usage) {
      const u = event.message.usage;
      sessionTokens += u.totalTokens;
      sessionCost += u.cost.total;
      editorRef?.setTokenInfo(u.input, u.output, sessionTokens, sessionCost);
    }
  });
}