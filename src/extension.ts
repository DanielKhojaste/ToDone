import * as vscode from 'vscode';
import {
  detectSeparator,
  EditContext,
  PriorityStyleSetting,
  SelectedLine,
  setPriority,
  shiftPriority,
  toggleState,
} from './edits';
import { buildOutline, OutlineNode } from './outline';
import { LineInfo, Priority, scanLines } from './parser';

const LANGUAGE_ID = 'todone';

export function activate(context: vscode.ExtensionContext): void {
  const register = (id: string, run: (lines: SelectedLine[], ctx: EditContext) => string[]) =>
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(id, (editor, edit) => applyToSelectedLines(editor, edit, run)),
    );

  register('todone.toggleCompleted', (lines) => toggleState(lines, 'completed'));
  register('todone.toggleEmergency', (lines) => toggleState(lines, 'emergency'));
  register('todone.toggleCancelled', (lines) => toggleState(lines, 'cancelled'));
  register('todone.increasePriority', (lines, ctx) => shiftPriority(lines, 1, ctx));
  register('todone.decreasePriority', (lines, ctx) => shiftPriority(lines, -1, ctx));
  for (const p of [1, 2, 3, 4, 5] as Priority[]) {
    register(`todone.setPriority${p}`, (lines, ctx) => setPriority(lines, p, ctx));
  }

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: LANGUAGE_ID },
      { provideDocumentSymbols: (document) => provideSymbols(document) },
      { label: 'ToDone' },
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}

function documentLines(document: vscode.TextDocument): string[] {
  const lines: string[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    lines.push(document.lineAt(i).text);
  }
  return lines;
}

/** Line numbers touched by the selections, without duplicates. */
function selectedLineNumbers(editor: vscode.TextEditor): number[] {
  const numbers = new Set<number>();
  for (const sel of editor.selections) {
    let end = sel.end.line;
    // A selection that ends at the very start of a line does not include it.
    if (end > sel.start.line && sel.end.character === 0) {
      end -= 1;
    }
    for (let line = sel.start.line; line <= end; line++) {
      numbers.add(line);
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

/**
 * Runs a line transformation over the selected lines. Changes go through the
 * edit builder VS Code hands to text editor commands, so they are applied as a
 * single undo step before the command resolves.
 */
function applyToSelectedLines(
  editor: vscode.TextEditor,
  builder: vscode.TextEditorEdit,
  run: (lines: SelectedLine[], ctx: EditContext) => string[],
): void {
  const document = editor.document;
  const infos = scanLines(documentLines(document));
  const config = vscode.workspace.getConfiguration('todone', document);
  const ctx: EditContext = {
    priorityStyle: config.get<PriorityStyleSetting>('priorityStyle', 'preserve'),
    separator: detectSeparator(infos),
  };

  const numbers = selectedLineNumbers(editor);
  const selected = numbers.map((n) => ({ text: document.lineAt(n).text, info: infos[n] }));
  const updated = run(selected, ctx);

  numbers.forEach((line, i) => {
    const before = selected[i].text;
    const after = updated[i];
    if (before === after) {
      return;
    }
    // Replace only the part that changed so cursors on the line stay put.
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) {
      start++;
    }
    let endBefore = before.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
      endBefore--;
      endAfter--;
    }
    builder.replace(new vscode.Range(line, start, line, endBefore), after.slice(start, endAfter));
  });
}

function provideSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
  const lines = documentLines(document);
  const infos: LineInfo[] = scanLines(lines);
  const config = vscode.workspace.getConfiguration('todone', document);
  const editorConfig = vscode.workspace.getConfiguration('editor', {
    uri: document.uri,
    languageId: document.languageId,
  });
  const tabSize = Number(editorConfig.get('tabSize', 4)) || 4;
  const nodes = buildOutline(lines, infos, {
    tabSize,
    showCompleted: config.get<boolean>('outline.showCompletedTasks', false),
    showCancelled: config.get<boolean>('outline.showCancelledTasks', false),
  });

  const toSymbol = (node: OutlineNode): vscode.DocumentSymbol => {
    const kind =
      node.kind === 'heading'
        ? vscode.SymbolKind.String
        : node.emergency
          ? vscode.SymbolKind.Event
          : vscode.SymbolKind.Field;
    const range = new vscode.Range(node.line, 0, node.endLine, lines[node.endLine].length);
    const selection = new vscode.Range(node.line, node.nameStart, node.line, node.nameEnd);
    const symbol = new vscode.DocumentSymbol(node.name, node.detail, kind, range, selection);
    symbol.children = node.children.map(toSymbol);
    return symbol;
  };
  return nodes.map(toSymbol);
}
