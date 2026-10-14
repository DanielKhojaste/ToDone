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
import { Priority, scanLines } from './parser';

export function activate(context: vscode.ExtensionContext): void {
  const register = (id: string, run: (lines: SelectedLine[], ctx: EditContext) => string[]) =>
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(id, (editor) => applyToSelectedLines(editor, run)),
    );

  register('todone.toggleCompleted', (lines) => toggleState(lines, 'completed'));
  register('todone.toggleEmergency', (lines) => toggleState(lines, 'emergency'));
  register('todone.toggleCancelled', (lines) => toggleState(lines, 'cancelled'));
  register('todone.increasePriority', (lines, ctx) => shiftPriority(lines, 1, ctx));
  register('todone.decreasePriority', (lines, ctx) => shiftPriority(lines, -1, ctx));
  for (const p of [1, 2, 3, 4, 5] as Priority[]) {
    register(`todone.setPriority${p}`, (lines, ctx) => setPriority(lines, p, ctx));
  }
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

async function applyToSelectedLines(
  editor: vscode.TextEditor,
  run: (lines: SelectedLine[], ctx: EditContext) => string[],
): Promise<void> {
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

  const changes = numbers
    .map((n, i) => ({ line: n, before: selected[i].text, after: updated[i] }))
    .filter((c) => c.before !== c.after);
  if (!changes.length) {
    return;
  }

  await editor.edit((builder) => {
    for (const { line, before, after } of changes) {
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
    }
  });
}
