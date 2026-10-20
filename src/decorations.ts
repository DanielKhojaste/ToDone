import * as vscode from 'vscode';
import { ColorStyle, computeColorRanges } from './colors';
import { scanLines } from './parser';

const LANGUAGE_ID = 'todone';

function color(id: string): vscode.ThemeColor {
  return new vscode.ThemeColor(`todone.${id}`);
}

/** Visual style for each kind of range. Colors come from `contributes.colors`. */
const STYLES: Record<ColorStyle, vscode.DecorationRenderOptions> = {
  'title-2': { color: color('priority2Foreground') },
  'title-3': { color: color('priority3Foreground') },
  'title-4': { color: color('priority4Foreground') },
  'title-5': { color: color('priority5Foreground'), fontWeight: 'bold' },
  'marker-1': { color: color('markerForeground') },
  'marker-2': { color: color('priority2Foreground'), opacity: '0.7' },
  'marker-3': { color: color('priority3Foreground'), opacity: '0.7' },
  'marker-4': { color: color('priority4Foreground'), opacity: '0.7' },
  'marker-5': { color: color('priority5Foreground'), fontWeight: 'bold' },
  'emergency-mark': {
    color: color('emergencyForeground'),
    backgroundColor: color('emergencyBackground'),
    fontWeight: 'bold',
  },
  'emergency-title': { fontWeight: 'bold' },
  'completed-mark': { color: color('completedForeground'), opacity: '1' },
  'completed-title': { textDecoration: 'line-through' },
  'completed-block': { opacity: '0.45' },
  'cancelled-mark': { color: color('cancelledForeground'), opacity: '1' },
  'cancelled-reason': { color: color('cancelledForeground'), fontStyle: 'italic', opacity: '0.8' },
  'cancelled-block': { opacity: '0.4' },
  note: { color: color('noteForeground'), opacity: '0.75' },
  heading: { color: color('headingForeground'), fontWeight: 'bold' },
};

/**
 * Paints ToDone files with the extension's own colors so that priorities and
 * states stay distinct whatever color theme is active. Turned off with
 * `"todone.colors": "theme"`.
 */
export class ToDoneDecorator implements vscode.Disposable {
  private readonly types = new Map<ColorStyle, vscode.TextEditorDecorationType>();
  private readonly disposables: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    for (const [style, options] of Object.entries(STYLES) as Array<[ColorStyle, vscode.DecorationRenderOptions]>) {
      this.types.set(style, vscode.window.createTextEditorDecorationType(options));
    }
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === LANGUAGE_ID) {
          this.schedule();
        }
      }),
      vscode.workspace.onDidOpenTextDocument(() => this.schedule()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('todone.colors') || e.affectsConfiguration('editor.tabSize')) {
          this.refreshAll();
        }
      }),
    );
    this.refreshAll();
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.refreshAll(), 50);
  }

  refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.refresh(editor);
    }
  }

  private refresh(editor: vscode.TextEditor): void {
    const document = editor.document;
    const enabled =
      document.languageId === LANGUAGE_ID &&
      vscode.workspace.getConfiguration('todone', document).get<string>('colors', 'builtin') === 'builtin';
    if (!enabled) {
      if (document.languageId === LANGUAGE_ID) {
        for (const type of this.types.values()) {
          editor.setDecorations(type, []);
        }
      }
      return;
    }
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }
    const tabSize = Number(vscode.workspace.getConfiguration('editor', document).get('tabSize', 4)) || 4;
    const ranges = computeColorRanges(lines, scanLines(lines), tabSize);
    for (const [style, type] of this.types) {
      const spans = ranges.get(style) ?? [];
      editor.setDecorations(
        type,
        spans.map((s) => new vscode.Range(s.line, s.start, s.line, s.end)),
      );
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.disposables.forEach((d) => d.dispose());
    this.types.forEach((t) => t.dispose());
  }
}
