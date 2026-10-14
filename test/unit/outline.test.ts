import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildOutline, OutlineNode, OutlineOptions } from '../../src/outline';
import { scanLines } from '../../src/parser';

const FIXTURES = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures');

function outline(text: string, opts: Partial<OutlineOptions> = {}): OutlineNode[] {
  const lines = text.split(/\r?\n/);
  return buildOutline(lines, scanLines(lines), { tabSize: 4, showCompleted: false, showCancelled: false, ...opts });
}

/** Compact representation: name plus nested children. */
function shape(nodes: OutlineNode[]): unknown[] {
  return nodes.map((n) => (n.children.length ? [n.name, shape(n.children)] : n.name));
}

describe('buildOutline', () => {
  it('nests tasks by indentation under headings', () => {
    const nodes = outline(['Work', '-4 Parent', '    -3 Child', '        -2 Grandchild', '-1 Sibling', 'Home', '-2 Laundry'].join('\n'));
    assert.deepStrictEqual(shape(nodes), [
      ['Work', [['Parent', [['Child', ['Grandchild']]]], 'Sibling']],
      ['Home', ['Laundry']],
    ]);
  });

  it('hides completed and cancelled tasks with their subtasks by default', () => {
    const text = ['-4 Active', '+-3 Done', '    -2 Done child', '.-3 (meh) Dropped', '    -1 Dropped child', '-2 Also active'].join('\n');
    assert.deepStrictEqual(shape(outline(text)), ['Active', 'Also active']);
    assert.deepStrictEqual(shape(outline(text, { showCompleted: true })), ['Active', ['Done', ['Done child']], 'Also active']);
    assert.deepStrictEqual(shape(outline(text, { showCancelled: true })), ['Active', ['Dropped', ['Dropped child']], 'Also active']);
  });

  it('describes priority and state in the detail', () => {
    const [a, b, c] = outline('-5 A\n!---- B\n.-2 (why) C', { showCancelled: true });
    assert.strictEqual(a.detail, 'priority 5');
    assert.strictEqual(b.detail, 'priority 4, emergency');
    assert.strictEqual(c.detail, 'priority 2, cancelled (why)');
  });

  it('includes notes and blank lines inside a task range', () => {
    const [task, next] = outline('-3 Task\n    note one\n\n    note two\n-2 Next');
    assert.strictEqual(task.line, 0);
    assert.strictEqual(task.endLine, 3);
    assert.strictEqual(next.line, 4);
  });

  it('skips tasks inside raw notes', () => {
    const nodes = outline('-3 Raw ///\n    -5 not a task\n    ///\n-2 Real');
    assert.deepStrictEqual(shape(nodes), ['Raw', 'Real']);
    assert.strictEqual(nodes[0].endLine, 2);
  });

  it('points the selection at the title', () => {
    const [task] = outline('    -3\tTitle: note');
    assert.strictEqual(task.nameStart, 7);
    assert.strictEqual(task.nameEnd, 12);
  });

  it('names empty tasks and headings', () => {
    const nodes = outline('/*\n*/\n-3');
    assert.strictEqual(nodes[0].name, '(heading)');
    assert.strictEqual(nodes[0].children[0].name, '(untitled task)');
  });

  it('joins multi-line offset headings', () => {
    const nodes = outline('/*\n\tOffset headings can be\n\tmulti-line\n*/\n-1 Task');
    assert.strictEqual(nodes[0].name, 'Offset headings can be multi-line');
    assert.deepStrictEqual(shape(nodes[0].children), ['Task']);
  });

  it('handles the original readme and the spec fixture', () => {
    for (const file of ['original-readme.todo', 'spec.todo', 'sample-crlf.todo']) {
      const nodes = outline(fs.readFileSync(path.join(FIXTURES, file), 'utf8'), { tabSize: 8 });
      assert.ok(nodes.length > 0, file);
      const all: OutlineNode[] = [];
      const walk = (ns: OutlineNode[]) => ns.forEach((n) => (all.push(n), walk(n.children)));
      walk(nodes);
      assert.ok(all.every((n) => !n.completed && !n.cancelled), `${file}: finished tasks are hidden`);
      assert.ok(all.every((n) => n.name.length > 0 && n.endLine >= n.line), file);
    }
  });
});
