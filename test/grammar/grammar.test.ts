import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { FIXTURES, ROOT, scopesOf, tokenize, Token } from './tokenize';

function lineOf(lines: Token[][], text: string): Token[] {
  const found = lines.find((l) => l.map((t) => t.text).join('') === text);
  if (!found) {
    throw new Error(`Line not found: ${text}`);
  }
  return found;
}

function assertScope(scopes: string[], expected: string, message?: string): void {
  assert.ok(scopes.includes(expected), `${message ?? ''} expected ${expected} in ${scopes.join(' | ')}`);
}

function assertNoScope(scopes: string[], unexpected: RegExp, message?: string): void {
  assert.ok(!scopes.some((s) => unexpected.test(s)), `${message ?? ''} unexpected ${unexpected} in ${scopes.join(' | ')}`);
}

async function single(text: string): Promise<Token[]> {
  return (await tokenize(text))[0];
}

describe('grammar', () => {
  it('is in sync with scripts/build-grammar.js', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { render, outFile } = require(path.join(ROOT, 'scripts', 'build-grammar.js'));
    assert.strictEqual(fs.readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n'), render());
  });

  describe('priorities', () => {
    for (const p of [1, 2, 3, 4, 5]) {
      it(`highlights -${p} and ${'-'.repeat(p)} identically`, async () => {
        const numeric = await single(`-${p} Task`);
        const hyphens = await single(`${'-'.repeat(p)} Task`);
        const nTitle = scopesOf(numeric, 'Task');
        const hTitle = scopesOf(hyphens, 'Task');
        assert.deepStrictEqual(nTitle, hTitle);
        assertScope(nTitle, `meta.title.priority-${p}.todone`);
        assertScope(nTitle, `meta.task.priority-${p}.todone`);
        assertScope(scopesOf(numeric, '-'), `meta.marker.priority-${p}.todone`);
        assertScope(scopesOf(numeric, String(p)), `meta.marker.priority-${p}.todone`);
        assertScope(scopesOf(numeric, String(p)), 'meta.marker.numeral.todone');
        assertScope(scopesOf(hyphens, '-'.repeat(p)), `meta.marker.priority-${p}.todone`);
      });
    }

    it('gives each level a different fallback scope', async () => {
      const fallbacks = new Set<string>();
      for (const p of [1, 2, 3, 4, 5]) {
        const title = scopesOf(await single(`-${p} Task`), 'Task');
        fallbacks.add(title.filter((s) => !s.endsWith('.todone')).join(' '));
      }
      assert.strictEqual(fallbacks.size, 5);
    });

    it('accepts tabs as the separator', async () => {
      assertScope(scopesOf(await single('-4\tTabbed'), 'Tabbed'), 'meta.title.priority-4.todone');
      assertScope(scopesOf(await single('----\tTabbed'), 'Tabbed'), 'meta.title.priority-4.todone');
    });

    it('does not treat other markers as tasks', async () => {
      for (const text of ['-6 Six', '------ Six hyphens', '-0 Zero', '-5Missing space']) {
        const line = await single(text);
        for (const token of line) {
          assertNoScope(token.scopes, /^meta\.task/, text);
        }
      }
    });

    it('accepts a marker at the end of a line', async () => {
      assertScope(scopesOf(await single('-3'), '3'), 'meta.marker.priority-3.todone');
    });
  });

  describe('states', () => {
    const cases: Array<[string, string, string]> = [
      ['!-5 Critical emergency task', 'meta.task.emergency.priority-5.todone', 'meta.title.priority-5.emergency.todone'],
      ['!----- Critical emergency task', 'meta.task.emergency.priority-5.todone', 'meta.title.priority-5.emergency.todone'],
      ['+-5 Critical completed task', 'meta.task.completed.todone', 'meta.title.completed.todone'],
      ['+----- Critical completed task', 'meta.task.completed.todone', 'meta.title.completed.todone'],
      ['.-5 Critical cancelled task', 'meta.task.cancelled.todone', 'meta.title.cancelled.todone'],
      ['.----- Critical cancelled task', 'meta.task.cancelled.todone', 'meta.title.cancelled.todone'],
    ];
    for (const [text, region, title] of cases) {
      it(`recognizes ${text}`, async () => {
        const scopes = scopesOf(await single(text), 'Critical');
        assertScope(scopes, region);
        assertScope(scopes, title);
      });
    }

    it('scopes the whole numeric marker in completed and cancelled tasks', async () => {
      assertScope(scopesOf(await single('+-5 Done'), '-5'), 'meta.marker.completed.todone');
      assertScope(scopesOf(await single('.-5 Dropped'), '-5'), 'meta.marker.cancelled.todone');
    });

    it('scopes the state characters', async () => {
      const line = await single('+!-3 Done emergency');
      assertScope(scopesOf(line, '+'), 'meta.state.completed.todone');
      assertScope(scopesOf(line, '!'), 'meta.state.emergency.inherited.todone');
      assertScope(scopesOf(await single('!-3 Fire'), '!'), 'meta.state.emergency.todone');
      assertScope(scopesOf(await single('.-3 Nope'), '.'), 'meta.state.cancelled.todone');
    });

    it('scopes the cancellation reason', async () => {
      const line = await single('.-5 (no longer needed) Ship it');
      assertScope(scopesOf(line, 'no longer needed'), 'meta.reason.cancelled.todone');
      assertScope(scopesOf(line, 'Ship it'), 'meta.title.cancelled.todone');
      const old = await single('.!-4\t(for example)');
      assertScope(scopesOf(old, 'for example'), 'meta.reason.cancelled.todone');
    });

    it('applies completed and cancelled to subtasks', async () => {
      const lines = await tokenize('+-4 Parent\n    -3 Child\n\n    -2 After blank\n-1 Sibling');
      assertScope(scopesOf(lines[1], 'Child'), 'meta.task.completed.todone');
      assertScope(scopesOf(lines[1], '-3'), 'meta.marker.inherited.todone');
      assertScope(scopesOf(lines[3], 'After blank'), 'meta.task.completed.todone');
      assertNoScope(scopesOf(lines[4], 'Sibling'), /completed/);

      const cancelled = await tokenize('.-4 Parent\n\t-3 Child');
      assertScope(scopesOf(cancelled[1], 'Child'), 'meta.task.cancelled.todone');
    });

    it('keeps subtasks of an emergency task highlighted by priority', async () => {
      const lines = await tokenize('!-4 Emergency parent\n    -2 Child');
      const child = scopesOf(lines[1], 'Child');
      assertScope(child, 'meta.task.emergency.priority-4.todone');
      assertScope(child, 'meta.title.priority-2.todone');
    });
  });

  describe('nesting', () => {
    it('nests tasks by indentation with spaces and tabs', async () => {
      for (const indent of ['    ', '\t']) {
        const lines = await tokenize(`-4 Parent\n${indent}-3 Child\n${indent}${indent}-2 Grandchild\n-1 Next`);
        const grandchild = scopesOf(lines[2], 'Grandchild');
        assertScope(grandchild, 'meta.task.priority-4.todone');
        assertScope(grandchild, 'meta.task.priority-3.todone');
        assertScope(grandchild, 'meta.title.priority-2.todone');
        assertNoScope(scopesOf(lines[3], 'Next'), /priority-4/);
      }
    });

    it('ends a task block at an unindented heading', async () => {
      const lines = await tokenize('-4 Task\nHeading\n    note');
      assertScope(scopesOf(lines[1], 'Heading'), 'meta.heading.todone');
      assertNoScope(scopesOf(lines[1], 'Heading'), /^meta\.task/);
    });
  });

  describe('notes', () => {
    it('highlights inline notes after a colon', async () => {
      const line = await single('-3 Task with inline note: this is a note');
      assertScope(scopesOf(line, 'Task with inline note'), 'meta.title.priority-3.todone');
      assertScope(scopesOf(line, ': this is a note'), 'meta.note.todone');
      assertScope(scopesOf(line, ': this is a note'), 'comment');
    });

    it('keeps URLs in titles', async () => {
      const line = await single('-3 See https://example.com/a/b: note');
      assertScope(scopesOf(line, 'See https://example.com/a/b'), 'meta.title.priority-3.todone');
    });

    it('highlights indented note lines', async () => {
      const lines = await tokenize('-3 Task\n    This is additional information.');
      assertScope(scopesOf(lines[1], 'This is additional information.'), 'meta.note.todone');
    });

    it('treats everything inside a raw note as note content', async () => {
      const lines = await tokenize(
        '-3 Task with raw note ///\n    This is a raw note block.\n    -5 Verify whether this remains note content.\n    ///\n-2 After',
      );
      const inside = scopesOf(lines[2], '-5 Verify');
      assertScope(inside, 'meta.note.raw.todone');
      assertNoScope(inside, /priority-5/);
      assertScope(scopesOf(lines[3], '///'), 'punctuation.definition.raw.end.todone');
      assertScope(scopesOf(lines[4], 'After'), 'meta.title.priority-2.todone');
    });

    it('highlights backtick emphasis in notes and titles', async () => {
      const note = await single('-3 Task: with a `highlighted phrase`');
      assertScope(scopesOf(note, 'highlighted phrase'), 'meta.emphasis.todone');
      const title = await single('-3 Task with a `highlighted phrase` in its note');
      const t = scopesOf(title, 'highlighted phrase');
      assertScope(t, 'meta.emphasis.todone');
      assertScope(t, 'meta.title.priority-3.todone');
    });
  });

  describe('headings', () => {
    it('treats unindented non-task lines as headings', async () => {
      assertScope(scopesOf(await single('Todo'), 'Todo'), 'meta.heading.todone');
      assertScope(scopesOf(await single('# Notes'), '# Notes'), 'meta.heading.todone');
    });

    it('supports /* offset headings */', async () => {
      const lines = await tokenize('/*\n\tOffset heading\n*/\n-1 Task');
      assertScope(scopesOf(lines[1], 'Offset heading'), 'meta.heading.block.todone');
      assertScope(scopesOf(lines[3], 'Task'), 'meta.title.priority-1.todone');
    });
  });

  describe('fixtures', () => {
    it('tokenizes Windows line endings the same as Unix ones', async () => {
      const crlf = fs.readFileSync(path.join(FIXTURES, 'sample-crlf.todo'), 'utf8');
      assert.ok(crlf.includes('\r\n'), 'fixture should use CRLF');
      const a = await tokenize(crlf);
      const b = await tokenize(crlf.replace(/\r\n/g, '\n'));
      assert.deepStrictEqual(a, b);
      assertScope(scopesOf(a[2], 'Numeric five'), 'meta.title.priority-5.todone');
    });

    it('matches the expected highlighting of the spec fixture', async () => {
      const lines = await tokenize(fs.readFileSync(path.join(FIXTURES, 'spec.todo'), 'utf8'));
      assertScope(scopesOf(lineOf(lines, 'Todo'), 'Todo'), 'meta.heading.todone');
      assertScope(scopesOf(lineOf(lines, '-5 Priority 5'), 'Priority 5'), 'meta.title.priority-5.todone');
      assertScope(scopesOf(lineOf(lines, '----- Priority 5 old syntax'), 'Priority 5 old syntax'), 'meta.title.priority-5.todone');
      assertScope(scopesOf(lineOf(lines, '        -2 Grandchild task'), 'Grandchild task'), 'meta.task.priority-4.todone');
      assertScope(
        scopesOf(lineOf(lines, '    -5 Verify whether this remains note content.'), '-5 Verify'),
        'meta.note.raw.todone',
      );
    });

    it('handles every line of the original ToDone readme', async () => {
      const lines = await tokenize(fs.readFileSync(path.join(FIXTURES, 'original-readme.todo'), 'utf8'));
      assertScope(scopesOf(lineOf(lines, '\t-----\t5 looks urgent'), '5 looks urgent'), 'meta.title.priority-5.todone');
      assertScope(scopesOf(lineOf(lines, '\t-2\t`-2` is the same `--`'), ' is the same '), 'meta.title.priority-2.todone');
      assertScope(scopesOf(lineOf(lines, '+!--\tA completed emergency task'), 'A completed emergency task'), 'meta.title.completed.todone');
      assertScope(scopesOf(lineOf(lines, '\t\t---\tThis sub-sub-task is ignored bc its parent is'), '---'), 'meta.marker.inherited.todone');
      assertScope(scopesOf(lineOf(lines, '\t- some simple notes'), '- some simple notes'), 'meta.note.raw.todone');
      assertScope(scopesOf(lineOf(lines, '#\tWhitespace is ignored'), '#\tWhitespace is ignored'), 'meta.note.raw.todone');
    });
  });
});
