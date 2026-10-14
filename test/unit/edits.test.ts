import * as assert from 'assert';
import {
  detectSeparator,
  EditContext,
  PriorityStyleSetting,
  resolveStyle,
  setPriority,
  shiftPriority,
  toggleState,
} from '../../src/edits';
import { scanLines } from '../../src/parser';

function sel(...texts: string[]) {
  const infos = scanLines(texts);
  return texts.map((text, i) => ({ text, info: infos[i] }));
}

function ctx(priorityStyle: PriorityStyleSetting = 'preserve', separator = ' '): EditContext {
  return { priorityStyle, separator };
}

describe('toggleState', () => {
  it('toggles completed and keeps the notation', () => {
    assert.deepStrictEqual(toggleState(sel('-5 Task'), 'completed'), ['+-5 Task']);
    assert.deepStrictEqual(toggleState(sel('+-5 Task'), 'completed'), ['-5 Task']);
    assert.deepStrictEqual(toggleState(sel('----- Task'), 'completed'), ['+----- Task']);
    assert.deepStrictEqual(toggleState(sel('+----- Task'), 'completed'), ['----- Task']);
  });

  it('toggles emergency alongside other states', () => {
    assert.deepStrictEqual(toggleState(sel('-5 Task'), 'emergency'), ['!-5 Task']);
    assert.deepStrictEqual(toggleState(sel('!-5 Task'), 'emergency'), ['-5 Task']);
    assert.deepStrictEqual(toggleState(sel('+-3 Done'), 'emergency'), ['+!-3 Done']);
    assert.deepStrictEqual(toggleState(sel('.-4 Gone'), 'emergency'), ['.!-4 Gone']);
  });

  it('toggles cancelled and keeps the reason', () => {
    assert.deepStrictEqual(toggleState(sel('-5 Task'), 'cancelled'), ['.-5 Task']);
    assert.deepStrictEqual(toggleState(sel('.-5 (why) Task'), 'cancelled'), ['-5 (why) Task']);
  });

  it('makes completed and cancelled mutually exclusive', () => {
    assert.deepStrictEqual(toggleState(sel('.-5 (why) Task'), 'completed'), ['+-5 (why) Task']);
    assert.deepStrictEqual(toggleState(sel('+!-5 Task'), 'cancelled'), ['.!-5 Task']);
  });

  it('preserves indentation, separators and notes', () => {
    assert.deepStrictEqual(toggleState(sel('\t\t-3\tTitle: note ///'), 'completed'), ['\t\t+-3\tTitle: note ///']);
  });

  it('applies one direction to a mixed selection, like toggling comments', () => {
    assert.deepStrictEqual(toggleState(sel('+-5 A', '-3 B', 'a note', '    --- C'), 'completed'), [
      '+-5 A',
      '+-3 B',
      'a note',
      '    +--- C',
    ]);
    assert.deepStrictEqual(toggleState(sel('+-5 A', '+-3 B'), 'completed'), ['-5 A', '-3 B']);
  });

  it('leaves non-task lines alone', () => {
    assert.deepStrictEqual(toggleState(sel('Heading', '', '    note'), 'completed'), ['Heading', '', '    note']);
  });
});

describe('shiftPriority', () => {
  it('preserves numeric style', () => {
    assert.deepStrictEqual(shiftPriority(sel('-3 Task'), 1, ctx()), ['-4 Task']);
    assert.deepStrictEqual(shiftPriority(sel('-3 Task'), -1, ctx()), ['-2 Task']);
  });

  it('preserves hyphen style', () => {
    assert.deepStrictEqual(shiftPriority(sel('--- Task'), 1, ctx()), ['---- Task']);
    assert.deepStrictEqual(shiftPriority(sel('--- Task'), -1, ctx()), ['-- Task']);
    assert.deepStrictEqual(shiftPriority(sel('- Task'), 1, ctx()), ['-- Task']);
  });

  it('never turns -5 into -----', () => {
    assert.deepStrictEqual(shiftPriority(sel('-5 Task'), 1, ctx()), ['-5 Task']);
    assert.deepStrictEqual(shiftPriority(sel('-5 Task'), -1, ctx()), ['-4 Task']);
  });

  it('clamps at 1 and 5', () => {
    assert.deepStrictEqual(shiftPriority(sel('-1 Low', '----- High'), -1, ctx()), ['-1 Low', '---- High']);
    assert.deepStrictEqual(shiftPriority(sel('-1 Low', '----- High'), 1, ctx()), ['-2 Low', '----- High']);
  });

  it('keeps states and indentation', () => {
    assert.deepStrictEqual(shiftPriority(sel('    +!-2\tDone'), 1, ctx()), ['    +!-3\tDone']);
    assert.deepStrictEqual(shiftPriority(sel('.-2 (why) Gone'), 1, ctx()), ['.-3 (why) Gone']);
  });

  it('follows an explicit style setting', () => {
    assert.deepStrictEqual(shiftPriority(sel('--- Task'), 1, ctx('numeric')), ['-4 Task']);
    assert.deepStrictEqual(shiftPriority(sel('-3 Task'), 1, ctx('hyphens')), ['---- Task']);
  });

  it('works on several lines at once', () => {
    assert.deepStrictEqual(shiftPriority(sel('-3 A', '    -- B', 'note'), 1, ctx()), ['-4 A', '    --- B', 'note']);
  });
});

describe('setPriority', () => {
  it('sets a priority in the existing style', () => {
    assert.deepStrictEqual(setPriority(sel('-1 Task'), 5, ctx()), ['-5 Task']);
    assert.deepStrictEqual(setPriority(sel('- Task'), 5, ctx()), ['----- Task']);
    assert.deepStrictEqual(setPriority(sel('!-2 Task'), 4, ctx()), ['!-4 Task']);
  });

  it('turns plain lines into tasks using the numeric style', () => {
    assert.deepStrictEqual(setPriority(sel('Buy milk', '    call back'), 3, ctx()), ['-3 Buy milk', '    -3 call back']);
    assert.deepStrictEqual(setPriority(sel('Buy milk'), 3, ctx('preserve', '\t')), ['-3\tBuy milk']);
    assert.deepStrictEqual(setPriority(sel('Buy milk'), 3, ctx('hyphens')), ['--- Buy milk']);
  });

  it('does not touch blank lines or raw note content', () => {
    const lines = sel('-2 Task ///', '    inside', '    ///', '');
    assert.deepStrictEqual(setPriority(lines, 4, ctx()), ['-4 Task ///', '    inside', '    ///', '']);
  });
});

describe('helpers', () => {
  it('resolves the marker style', () => {
    assert.strictEqual(resolveStyle('preserve', 'hyphens'), 'hyphens');
    assert.strictEqual(resolveStyle('preserve', 'numeric'), 'numeric');
    assert.strictEqual(resolveStyle('preserve'), 'numeric');
    assert.strictEqual(resolveStyle('hyphens', 'numeric'), 'hyphens');
  });

  it('detects the separator from the first task', () => {
    assert.strictEqual(detectSeparator(scanLines(['Heading', '-3\tTask'])), '\t');
    assert.strictEqual(detectSeparator(scanLines(['-3  Task'])), ' ');
    assert.strictEqual(detectSeparator(scanLines(['Heading'])), ' ');
  });
});
