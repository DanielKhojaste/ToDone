/**
 * Line-level parser for ToDone documents.
 *
 * This mirrors the rules in the TextMate grammar (see scripts/build-grammar.js)
 * closely enough for commands and the outline to agree with what is
 * highlighted. It has no dependency on the VS Code API so it can be unit tested
 * with plain Node.
 */

export type Priority = 1 | 2 | 3 | 4 | 5;

/** `numeric` is `-3`, `hyphens` is `---`. A single `-` counts as hyphens. */
export type MarkerStyle = 'numeric' | 'hyphens';

export interface TaskLine {
  /** Leading whitespace, kept exactly as written. */
  indent: string;
  completed: boolean;
  cancelled: boolean;
  emergency: boolean;
  /** The marker as written, for example `-3` or `---`. */
  marker: string;
  priority: Priority;
  style: MarkerStyle;
  /** Whitespace between the marker and the text. */
  separator: string;
  /** Everything after the separator: reason, title and note. */
  rest: string;
  /** Cancellation reason without the parentheses, if present. */
  reason?: string;
  /** Title text (without reason or note), trailing whitespace removed. */
  title: string;
  /** Column where the title starts. */
  titleStart: number;
  /** Column right after the last title character. */
  titleEnd: number;
  /** Column where the note part starts (`:` or `///`), or the line length. */
  noteStart: number;
}

export type LineKind =
  | 'blank'
  | 'heading'
  | 'heading-block'
  | 'task'
  | 'note'
  /** Inside a `///` raw note or a backtick span that continues across lines. */
  | 'raw';

export interface LineInfo {
  kind: LineKind;
  task?: TaskLine;
}

const TASK_RE = /^([ \t]*)(\.?)(\+?)(!?)(-[1-5](?=\s|$)|-+(?=\s|$))([ \t]*)(.*)$/;
const REASON_RE = /^\(([^)\n]*)\)[ \t]*/;
// Same as the grammar: stop at `:` (unless it starts `://`) or at `///`.
const TITLE_RE = /^(?::\/\/|\/(?!\/\/)|[^:/\n])*/;

/** Parses a single line as a task. Returns undefined for anything else. */
export function parseTaskLine(text: string): TaskLine | undefined {
  const m = TASK_RE.exec(text);
  if (!m) {
    return undefined;
  }
  const [, indent, dot, plus, bang, marker, separator, rest] = m;
  const cancelled = dot === '.';
  const completed = plus === '+';

  let priority: number;
  let style: MarkerStyle;
  if (/^-[1-5]$/.test(marker)) {
    priority = Number(marker[1]);
    style = 'numeric';
  } else {
    // Active tasks only allow one to five hyphens. Completed and cancelled
    // tasks accept any number, matching the original grammar.
    if (marker.length > 5 && !cancelled && !completed) {
      return undefined;
    }
    priority = Math.min(marker.length, 5);
    style = 'hyphens';
  }

  const restStart = text.length - rest.length;
  let titleOffset = 0;
  let reason: string | undefined;
  if (cancelled) {
    const r = REASON_RE.exec(rest);
    if (r) {
      reason = r[1];
      titleOffset = r[0].length;
    }
  }
  const afterReason = rest.slice(titleOffset);
  const rawTitle = (TITLE_RE.exec(afterReason) ?? [''])[0];
  const title = rawTitle.replace(/\s+$/, '');
  const titleStart = restStart + titleOffset;

  return {
    indent,
    completed,
    cancelled,
    emergency: bang === '!',
    marker,
    priority: priority as Priority,
    style,
    separator,
    rest,
    reason,
    title,
    titleStart,
    titleEnd: titleStart + title.length,
    noteStart: titleStart + rawTitle.length,
  };
}

/** Builds the text of a task line from its parts. */
export function formatTaskLine(
  task: Pick<TaskLine, 'indent' | 'completed' | 'cancelled' | 'emergency' | 'marker' | 'separator' | 'rest'>,
): string {
  return (
    task.indent +
    (task.cancelled ? '.' : '') +
    (task.completed ? '+' : '') +
    (task.emergency ? '!' : '') +
    task.marker +
    task.separator +
    task.rest
  );
}

/** Returns the marker text for a priority in the given style. */
export function formatMarker(priority: Priority, style: MarkerStyle): string {
  return style === 'numeric' ? `-${priority}` : '-'.repeat(priority);
}

type NoteState = 'none' | 'emphasis' | 'raw' | 'raw-emphasis';

/**
 * Walks note text and returns the state at the end of the line. Raw notes
 * (`///`) and backtick spans can continue onto following lines, and lines
 * inside them are never tasks.
 */
function scanNote(text: string, start: number, state: NoteState): NoteState {
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    switch (state) {
      case 'none':
        if (ch === '`') {
          state = 'emphasis';
        } else if (text.startsWith('///', i)) {
          state = 'raw';
          i += 2;
        }
        break;
      case 'emphasis':
      case 'raw-emphasis':
        if (ch === '\\' && text[i + 1] === '`') {
          i += 1;
        } else if (ch === '`') {
          state = state === 'emphasis' ? 'none' : 'raw';
        }
        break;
      case 'raw':
        if (ch === '`') {
          state = 'raw-emphasis';
        } else if (text.startsWith('///', i)) {
          state = 'none';
          i += 2;
        }
        break;
    }
    i += 1;
  }
  return state;
}

/** Classifies every line of a document. */
export function scanLines(lines: readonly string[]): LineInfo[] {
  const result: LineInfo[] = [];
  let note: NoteState = 'none';
  let inHeadingBlock = false;

  for (const text of lines) {
    if (inHeadingBlock) {
      result.push({ kind: 'heading-block' });
      if (text.includes('*/')) {
        inHeadingBlock = false;
      }
      continue;
    }
    if (note !== 'none') {
      result.push({ kind: 'raw' });
      note = scanNote(text, 0, note);
      continue;
    }
    if (text.trim() === '') {
      result.push({ kind: 'blank' });
      continue;
    }
    if (text.startsWith('/*')) {
      result.push({ kind: 'heading-block' });
      inHeadingBlock = !text.includes('*/', 2);
      continue;
    }
    const task = parseTaskLine(text);
    if (task) {
      result.push({ kind: 'task', task });
      note = scanNote(text, task.noteStart, 'none');
      continue;
    }
    if (/^[^\s.\-+!]/.test(text)) {
      result.push({ kind: 'heading' });
      continue;
    }
    result.push({ kind: 'note' });
    note = scanNote(text, 0, 'none');
  }
  // An unterminated backtick at the end of a single line only affects
  // following lines, which have already been classified above.
  return result;
}

/** Width of leading whitespace with tabs expanded to the next tab stop. */
export function indentWidth(text: string, tabSize: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') {
      width += 1;
    } else if (ch === '\t') {
      width += tabSize - (width % tabSize);
    } else {
      break;
    }
  }
  return width;
}

/** Text of a heading line or `/* ... *\/` block line, cleaned for display. */
export function headingText(text: string): string {
  return text
    .replace(/^\s*\/\*/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
