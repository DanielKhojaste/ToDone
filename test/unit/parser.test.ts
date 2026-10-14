import * as assert from 'assert';
import { formatTaskLine, headingText, indentWidth, parseTaskLine, scanLines, TaskLine } from '../../src/parser';

describe('parseTaskLine', () => {
  it('parses numeric priorities -1 through -5', () => {
    for (const p of [1, 2, 3, 4, 5]) {
      const t = parseTaskLine(`-${p} Priority ${p}`);
      assert.ok(t);
      assert.strictEqual(t.priority, p);
      assert.strictEqual(t.style, 'numeric');
      assert.strictEqual(t.marker, `-${p}`);
      assert.strictEqual(t.title, `Priority ${p}`);
    }
  });

  it('parses repeated-hyphen priorities', () => {
    for (const p of [1, 2, 3, 4, 5]) {
      const t = parseTaskLine(`${'-'.repeat(p)} Priority ${p}`);
      assert.ok(t);
      assert.strictEqual(t.priority, p);
      assert.strictEqual(t.style, 'hyphens');
    }
  });

  it('parses states combined with numeric and hyphen markers', () => {
    const cases: Array<[string, Partial<TaskLine>]> = [
      ['!-5 Critical', { emergency: true, completed: false, cancelled: false, priority: 5, style: 'numeric' }],
      ['+-5 Critical', { completed: true, priority: 5 }],
      ['.-5 Critical', { cancelled: true, priority: 5 }],
      ['+!-5 Critical', { completed: true, emergency: true, priority: 5 }],
      ['.!-4 Critical', { cancelled: true, emergency: true, priority: 4 }],
      ['.+!-2 Critical', { cancelled: true, completed: true, emergency: true, priority: 2 }],
      ['!----- Critical', { emergency: true, priority: 5, style: 'hyphens' }],
      ['+-- Critical', { completed: true, priority: 2, style: 'hyphens' }],
    ];
    for (const [text, expected] of cases) {
      const t = parseTaskLine(text);
      assert.ok(t, text);
      for (const [key, value] of Object.entries(expected)) {
        assert.strictEqual((t as unknown as Record<string, unknown>)[key], value, `${text}: ${key}`);
      }
      assert.strictEqual(t.title, 'Critical');
    }
  });

  it('keeps indentation and separator exactly', () => {
    const t = parseTaskLine('\t  -3\t\tTitle');
    assert.ok(t);
    assert.strictEqual(t.indent, '\t  ');
    assert.strictEqual(t.separator, '\t\t');
    assert.strictEqual(formatTaskLine(t), '\t  -3\t\tTitle');
  });

  it('separates title from inline and raw notes', () => {
    assert.strictEqual(parseTaskLine('-3 Title: the note')?.title, 'Title');
    assert.strictEqual(parseTaskLine('-3 Title ///')?.title, 'Title');
    assert.strictEqual(parseTaskLine('-3 See https://example.com/x: note')?.title, 'See https://example.com/x');
    assert.strictEqual(parseTaskLine('-3 a/b and c/d')?.title, 'a/b and c/d');
  });

  it('reads a cancellation reason', () => {
    const t = parseTaskLine('.-5 (not needed) Title');
    assert.ok(t);
    assert.strictEqual(t.reason, 'not needed');
    assert.strictEqual(t.title, 'Title');
  });

  it('rejects lines that are not tasks', () => {
    for (const text of ['', 'Heading', '    a note', '-6 Six', '------ six', '-5Missing space', '- ', '-0 zero']) {
      if (text === '- ') {
        assert.ok(parseTaskLine(text), 'a lone hyphen with a space is an empty task');
        continue;
      }
      assert.strictEqual(parseTaskLine(text), undefined, text);
    }
  });

  it('accepts long hyphen runs only for finished tasks, like the original grammar', () => {
    assert.strictEqual(parseTaskLine('.------- Old')?.priority, 5);
    assert.strictEqual(parseTaskLine('+------- Old')?.priority, 5);
    assert.strictEqual(parseTaskLine('!------ Old'), undefined);
  });
});

describe('scanLines', () => {
  it('classifies headings, tasks, notes and blanks', () => {
    const kinds = scanLines(['Todo', '', '-3 Task', '    a note', '/*', 'offset', '*/', '+ not a heading']).map((l) => l.kind);
    assert.deepStrictEqual(kinds, ['heading', 'blank', 'task', 'note', 'heading-block', 'heading-block', 'heading-block', 'note']);
  });

  it('does not see tasks inside raw notes', () => {
    const kinds = scanLines([
      '-3 Task with raw note ///',
      '    This is a raw note block.',
      '    -5 Verify whether this remains note content.',
      '    ///',
      '-2 After',
    ]).map((l) => l.kind);
    assert.deepStrictEqual(kinds, ['task', 'raw', 'raw', 'raw', 'task']);
  });

  it('ignores /// inside backticks within a raw note', () => {
    const kinds = scanLines(['-3 Notes: ///', '    The `///` marker', '    -2 still raw', '    ///', '-1 Task']).map((l) => l.kind);
    assert.deepStrictEqual(kinds, ['task', 'raw', 'raw', 'raw', 'task']);
  });

  it('continues a backtick span across lines', () => {
    const kinds = scanLines(['-2 Add: `', '    -1 inside', '    `', '-1 Task']).map((l) => l.kind);
    assert.deepStrictEqual(kinds, ['task', 'raw', 'raw', 'task']);
  });

  it('does not treat backticks in a title as an open span', () => {
    const kinds = scanLines(['-2 Title with ` backtick', '-1 Task']).map((l) => l.kind);
    assert.deepStrictEqual(kinds, ['task', 'task']);
  });
});

describe('helpers', () => {
  it('expands tabs when measuring indentation', () => {
    assert.strictEqual(indentWidth('\t-3', 4), 4);
    assert.strictEqual(indentWidth('  \t-3', 4), 4);
    assert.strictEqual(indentWidth('        -3', 4), 8);
  });

  it('cleans heading text', () => {
    assert.strictEqual(headingText('/*  Offset   heading */'), 'Offset heading');
    assert.strictEqual(headingText('Plain'), 'Plain');
  });
});
