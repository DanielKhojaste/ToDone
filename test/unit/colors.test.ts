import * as assert from 'assert';
import { ColorStyle, computeColorRanges } from '../../src/colors';
import { scanLines } from '../../src/parser';

function styles(text: string) {
  const lines = text.split('\n');
  const ranges = computeColorRanges(lines, scanLines(lines), 4);
  /** Text covered by a style, as "line:text" entries. */
  return (style: ColorStyle) =>
    (ranges.get(style) ?? []).map((s) => `${s.line}:${lines[s.line].slice(s.start, s.end)}`);
}

describe('computeColorRanges', () => {
  it('colors numeric and hyphen markers and titles by priority', () => {
    const s = styles('-5 Numeric\n----- Hyphens\n-3 Three\n--- Three too\n-1 Low');
    assert.deepStrictEqual(s('title-5'), ['0:Numeric', '1:Hyphens']);
    assert.deepStrictEqual(s('marker-5'), ['0:-5', '1:-----']);
    assert.deepStrictEqual(s('title-3'), ['2:Three', '3:Three too']);
    assert.deepStrictEqual(s('marker-1'), ['4:-1']);
    assert.deepStrictEqual(s('title-1'), ['4:Low']);
  });

  it('marks emergency tasks', () => {
    const s = styles('!-5 Fire\n    !---- Indented');
    assert.deepStrictEqual(s('emergency-mark'), ['0:!', '1:!']);
    assert.deepStrictEqual(s('emergency-title'), ['0:Fire', '1:Indented']);
    assert.deepStrictEqual(s('marker-4'), ['1:----']);
  });

  it('dims completed tasks and everything nested under them', () => {
    const s = styles('+-4 Done\n    -3 Child\n    a note\n\n    -2 After blank\n-1 Next');
    assert.deepStrictEqual(s('completed-mark'), ['0:+']);
    assert.deepStrictEqual(s('completed-title'), ['0:Done']);
    assert.deepStrictEqual(s('completed-block'), ['0:+-4 Done', '1:-3 Child', '2:a note', '4:-2 After blank']);
    assert.deepStrictEqual(s('title-3'), []);
    assert.deepStrictEqual(s('marker-1'), ['5:-1']);
  });

  it('dims cancelled tasks and highlights the reason', () => {
    const s = styles('.!-5 (not needed) Gone\n\t-2 Child');
    assert.deepStrictEqual(s('cancelled-mark'), ['0:.']);
    assert.deepStrictEqual(s('cancelled-reason'), ['0:(not needed)']);
    assert.deepStrictEqual(s('cancelled-block'), ['0:.!-5 (not needed) Gone', '1:-2 Child']);
    assert.deepStrictEqual(s('emergency-mark'), []);
  });

  it('colors notes, raw notes and headings', () => {
    const s = styles('Work\n-3 Task: inline\n    below\n-2 Raw ///\n    -5 not a task\n    ///');
    assert.deepStrictEqual(s('heading'), ['0:Work']);
    assert.deepStrictEqual(s('note'), ['1:: inline', '2:below', '3:///', '4:-5 not a task', '5:///']);
    assert.deepStrictEqual(s('title-5'), []);
  });

  it('highlights backtick text in notes, keeping the backticks dim', () => {
    const s = styles('-5 Some color: `in backticks` after\n    a `note` line');
    assert.deepStrictEqual(s('emphasis'), ['0:in backticks', '1:note']);
    assert.deepStrictEqual(s('note'), ['0:: `', '0:` after', '1:a `', '1:` line']);
    assert.deepStrictEqual(s('title-5'), ['0:Some color']);
  });

  it('continues an unclosed backtick span onto the next lines', () => {
    const s = styles('-2 Add: `\n    -1 inside\n    end` done\n-1 Next');
    assert.deepStrictEqual(s('emphasis'), ['1:    -1 inside', '2:    end']);
    assert.deepStrictEqual(s('title-1'), ['3:Next']);
  });

  it('ignores escaped backticks and backticks in titles', () => {
    const s = styles('-3 Title with `ticks`: a `b \\` c` d');
    assert.deepStrictEqual(s('emphasis'), ['0:b \\` c']);
  });

  it('keeps notes of finished tasks uniformly dim', () => {
    const s = styles('+-3 Done: `x`\n    `y`');
    assert.deepStrictEqual(s('emphasis'), []);
  });
});
