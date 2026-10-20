/**
 * Works out which parts of a ToDone document get which built-in color.
 *
 * The TextMate grammar alone leaves the final colors to the user's theme, and
 * many themes give the scopes ToDone relies on the same color (or none). The
 * extension therefore paints tasks itself with editor decorations, using
 * colors it contributes with sensible defaults for dark, light and high
 * contrast themes. This module is the pure part of that: it only computes
 * ranges, so it can be unit tested without VS Code.
 */
import { indentWidth, LineInfo } from './parser';

export type ColorStyle =
  | 'title-1'
  | 'title-2'
  | 'title-3'
  | 'title-4'
  | 'title-5'
  | 'marker-1'
  | 'marker-2'
  | 'marker-3'
  | 'marker-4'
  | 'marker-5'
  | 'emergency-mark'
  | 'emergency-title'
  | 'completed-mark'
  | 'completed-title'
  | 'completed-block'
  | 'cancelled-mark'
  | 'cancelled-reason'
  | 'cancelled-block'
  | 'note'
  | 'heading';

export interface Span {
  line: number;
  start: number;
  end: number;
}

export type ColorRanges = Map<ColorStyle, Span[]>;

interface Open {
  width: number;
  finished?: 'completed' | 'cancelled';
}

export function computeColorRanges(lines: readonly string[], infos: readonly LineInfo[], tabSize: number): ColorRanges {
  const ranges: ColorRanges = new Map();
  const add = (style: ColorStyle, line: number, start: number, end: number) => {
    if (end <= start) {
      return;
    }
    let list = ranges.get(style);
    if (!list) {
      list = [];
      ranges.set(style, list);
    }
    list.push({ line, start, end });
  };

  const stack: Open[] = [];
  const inherited = () => stack.find((o) => o.finished)?.finished;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const info = infos[i];
    const contentStart = text.length - text.trimStart().length;

    if (info.kind === 'blank') {
      continue;
    }
    if (info.kind === 'heading' || info.kind === 'heading-block') {
      stack.length = 0;
      add('heading', i, contentStart, text.length);
      continue;
    }
    if (info.kind !== 'raw') {
      const width = indentWidth(text, tabSize);
      while (stack.length && stack[stack.length - 1].width >= width) {
        stack.pop();
      }
    }

    const parentFinished = inherited();
    if (info.kind === 'raw' || info.kind === 'note') {
      if (parentFinished) {
        add(`${parentFinished}-block`, i, contentStart, text.length);
      } else {
        add('note', i, contentStart, text.length);
      }
      continue;
    }

    const task = info.task;
    if (!task) {
      continue;
    }
    const markerStart = task.indent.length + (task.cancelled ? 1 : 0) + (task.completed ? 1 : 0) + (task.emergency ? 1 : 0);
    const markerEnd = markerStart + task.marker.length;
    const own = task.cancelled ? 'cancelled' : task.completed ? 'completed' : undefined;
    stack.push({ width: indentWidth(text, tabSize), finished: own });

    const finished = parentFinished ?? own;
    if (finished) {
      add(`${finished}-block`, i, task.indent.length, text.length);
      if (own === 'completed') {
        const plus = task.indent.length + (task.cancelled ? 1 : 0);
        add('completed-mark', i, plus, plus + 1);
        add('completed-title', i, task.titleStart, task.titleEnd);
      }
      if (own === 'cancelled') {
        add('cancelled-mark', i, task.indent.length, task.indent.length + 1);
        if (task.reason !== undefined) {
          const open = text.indexOf('(', markerEnd);
          const close = text.indexOf(')', open);
          add('cancelled-reason', i, open, close + 1);
        }
      }
      continue;
    }

    add(`marker-${task.priority}`, i, markerStart, markerEnd);
    add(`title-${task.priority}`, i, task.titleStart, task.titleEnd);
    if (task.emergency) {
      const bang = markerStart - 1;
      add('emergency-mark', i, bang, bang + 1);
      add('emergency-title', i, task.titleStart, task.titleEnd);
    }
    if (task.noteStart < text.length) {
      add('note', i, task.noteStart, text.length);
    }
  }
  return ranges;
}
