import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const FIXTURES = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures');

async function openText(content: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ language: 'todone', content });
  return vscode.window.showTextDocument(document);
}

function select(editor: vscode.TextEditor, ...lines: number[]): void {
  editor.selections = lines.map((l) => new vscode.Selection(l, 0, l, 0));
}

async function run(editor: vscode.TextEditor, command: string, ...lines: number[]): Promise<string> {
  select(editor, ...lines);
  await vscode.commands.executeCommand(command);
  return editor.document.getText();
}

async function setStyle(value: string | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('todone').update('priorityStyle', value, vscode.ConfigurationTarget.Global);
}

describe('ToDone extension', function () {
  this.timeout(20000);

  afterEach(async () => {
    await setStyle(undefined);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('recognizes .todo and .todone files', async () => {
    for (const file of ['spec.todo', 'sample.todone']) {
      const document = await vscode.workspace.openTextDocument(path.join(FIXTURES, file));
      assert.strictEqual(document.languageId, 'todone', file);
    }
  });

  it('activates and registers all commands', async () => {
    await openText('-3 Task');
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'todone-vscode');
    assert.ok(ext, 'extension is installed');
    await ext.activate();
    assert.ok(ext.isActive);
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'todone.toggleCompleted',
      'todone.toggleEmergency',
      'todone.toggleCancelled',
      'todone.increasePriority',
      'todone.decreasePriority',
      'todone.setPriority1',
      'todone.setPriority5',
    ]) {
      assert.ok(commands.includes(id), id);
    }
  });

  it('toggles states without changing the notation', async () => {
    const editor = await openText('-5 Numeric\n----- Hyphens\n    -3 Indented: with a note');
    assert.strictEqual(
      await run(editor, 'todone.toggleCompleted', 0),
      '+-5 Numeric\n----- Hyphens\n    -3 Indented: with a note',
    );
    assert.strictEqual(
      await run(editor, 'todone.toggleEmergency', 1),
      '+-5 Numeric\n!----- Hyphens\n    -3 Indented: with a note',
    );
    assert.strictEqual(
      await run(editor, 'todone.toggleCancelled', 2),
      '+-5 Numeric\n!----- Hyphens\n    .-3 Indented: with a note',
    );
    assert.strictEqual(
      await run(editor, 'todone.toggleCompleted', 0),
      '-5 Numeric\n!----- Hyphens\n    .-3 Indented: with a note',
    );
  });

  it('changes priority and preserves numeric or hyphen style', async () => {
    const editor = await openText('-3 Numeric\n--- Hyphens');
    assert.strictEqual(await run(editor, 'todone.increasePriority', 0, 1), '-4 Numeric\n---- Hyphens');
    assert.strictEqual(await run(editor, 'todone.increasePriority', 0, 1), '-5 Numeric\n----- Hyphens');
    assert.strictEqual(await run(editor, 'todone.increasePriority', 0, 1), '-5 Numeric\n----- Hyphens');
    assert.strictEqual(await run(editor, 'todone.decreasePriority', 0), '-4 Numeric\n----- Hyphens');
    assert.strictEqual(await run(editor, 'todone.setPriority1', 0, 1), '-1 Numeric\n- Hyphens');
  });

  it('honors the todone.priorityStyle setting', async () => {
    await setStyle('numeric');
    const editor = await openText('--- Hyphens');
    assert.strictEqual(await run(editor, 'todone.increasePriority', 0), '-4 Hyphens');
    await setStyle('hyphens');
    assert.strictEqual(await run(editor, 'todone.setPriority2', 0), '-- Hyphens');
  });

  it('applies commands to every line of a multi-line selection', async () => {
    const editor = await openText('-1 A\n    note\n-2 B\n-3 C');
    editor.selection = new vscode.Selection(0, 0, 3, 0); // ends at column 0, so line 3 is excluded
    await vscode.commands.executeCommand('todone.toggleCompleted');
    assert.strictEqual(editor.document.getText(), '+-1 A\n    note\n+-2 B\n-3 C');
  });

  it('applies commands with multiple cursors', async () => {
    const editor = await openText('-1 A\n-2 B\n-3 C');
    assert.strictEqual(await run(editor, 'todone.toggleEmergency', 0, 2), '!-1 A\n-2 B\n!-3 C');
  });

  it('turns a plain line into a numeric task', async () => {
    const editor = await openText('Heading\n    buy milk');
    assert.strictEqual(await run(editor, 'todone.setPriority3', 1), 'Heading\n    -3 buy milk');
  });

  it('keeps Windows line endings', async () => {
    const document = await vscode.workspace.openTextDocument(path.join(FIXTURES, 'sample-crlf.todo'));
    const editor = await vscode.window.showTextDocument(document);
    assert.strictEqual(document.eol, vscode.EndOfLine.CRLF);
    select(editor, 2);
    await vscode.commands.executeCommand('todone.toggleCompleted');
    assert.strictEqual(
      document.lineAt(2).text,
      '+-5 Numeric five',
      `active=${vscode.window.activeTextEditor?.document.uri.toString()} lang=${document.languageId} sel=${JSON.stringify(editor.selections)} dirty=${document.isDirty}`,
    );
    assert.strictEqual(document.eol, vscode.EndOfLine.CRLF);
    assert.ok(document.getText().includes('\r\n+-5 Numeric five\r\n'));
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  it('provides an outline that skips finished tasks', async () => {
    const editor = await openText(
      ['Work', '-4 Parent', '    -3 Child', '+-2 Done', '.-2 Dropped', 'Home', '!-5 Fire'].join('\n'),
    );
    const symbols = (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      editor.document.uri,
    )) ?? [];
    const shape = (s: vscode.DocumentSymbol): unknown =>
      s.children.length ? [s.name, s.children.map(shape)] : s.name;
    assert.deepStrictEqual(symbols.map(shape), [
      ['Work', [['Parent', ['Child']]]],
      ['Home', ['Fire']],
    ]);
    const fire = symbols[1].children[0];
    assert.strictEqual(fire.kind, vscode.SymbolKind.Event);
    assert.strictEqual(fire.detail, 'priority 5, emergency');
  });
});
