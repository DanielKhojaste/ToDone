/**
 * Pure text transformations behind the ToDone commands. Each function takes
 * the text of the selected lines and returns their new text (or the same
 * string when a line is left alone).
 */
import {
  formatMarker,
  formatTaskLine,
  LineInfo,
  MarkerStyle,
  Priority,
  TaskLine,
} from './parser';

/** Value of the `todone.priorityStyle` setting. */
export type PriorityStyleSetting = 'preserve' | 'numeric' | 'hyphens';

export type TaskState = 'completed' | 'cancelled' | 'emergency';

export interface EditContext {
  priorityStyle: PriorityStyleSetting;
  /** Whitespace placed after a marker when a plain line becomes a task. */
  separator: string;
}

export interface SelectedLine {
  text: string;
  info: LineInfo;
}

/** Picks the marker style to write, given the current marker (if any). */
export function resolveStyle(setting: PriorityStyleSetting, current?: MarkerStyle): MarkerStyle {
  if (setting === 'numeric' || setting === 'hyphens') {
    return setting;
  }
  // `preserve`: keep what the line already uses. New markers are numeric.
  return current ?? 'numeric';
}

function clamp(priority: number): Priority {
  return Math.max(1, Math.min(5, priority)) as Priority;
}

function withPriority(task: TaskLine, priority: Priority, ctx: EditContext): string {
  const marker = formatMarker(priority, resolveStyle(ctx.priorityStyle, task.style));
  return formatTaskLine({ ...task, marker });
}

/**
 * Toggles a state on every task line in the selection. Like VS Code's line
 * comment toggle, the state is added to all lines unless every task already
 * has it, in which case it is removed from all of them.
 *
 * Completed and cancelled are treated as mutually exclusive: completing a
 * cancelled task removes the `.` and cancelling a completed task removes the
 * `+`. Everything else on the line, including a cancellation reason, is kept.
 */
export function toggleState(lines: readonly SelectedLine[], state: TaskState): string[] {
  const tasks = lines.filter((l) => l.info.task).map((l) => l.info.task as TaskLine);
  const enable = tasks.some((t) => !t[state]);
  return lines.map(({ text, info }) => {
    const task = info.task;
    if (!task || task[state] === enable) {
      return text;
    }
    const next = { ...task, [state]: enable };
    if (enable && state === 'completed') {
      next.cancelled = false;
    } else if (enable && state === 'cancelled') {
      next.completed = false;
    }
    return formatTaskLine(next);
  });
}

/** Raises or lowers the priority of every task line by `delta`, within 1..5. */
export function shiftPriority(lines: readonly SelectedLine[], delta: number, ctx: EditContext): string[] {
  return lines.map(({ text, info }) => {
    const task = info.task;
    if (!task) {
      return text;
    }
    return withPriority(task, clamp(task.priority + delta), ctx);
  });
}

/**
 * Sets an explicit priority. Task lines keep their state and text. Plain note
 * or heading lines are turned into tasks, which is a quick way to promote a
 * line of text to a task.
 */
export function setPriority(lines: readonly SelectedLine[], priority: Priority, ctx: EditContext): string[] {
  return lines.map(({ text, info }) => {
    if (info.task) {
      return withPriority(info.task, priority, ctx);
    }
    if (info.kind === 'note' || info.kind === 'heading') {
      const indent = /^[ \t]*/.exec(text)?.[0] ?? '';
      const marker = formatMarker(priority, resolveStyle(ctx.priorityStyle));
      return indent + marker + ctx.separator + text.slice(indent.length);
    }
    return text;
  });
}

/**
 * Picks the separator for new tasks from the first task in the document, so a
 * file written with hard tabs (as the original ToDone recommends) stays that
 * way. Defaults to a single space.
 */
export function detectSeparator(infos: readonly LineInfo[]): string {
  for (const info of infos) {
    const sep = info.task?.separator;
    if (sep) {
      return sep.includes('\t') ? '\t' : ' ';
    }
  }
  return ' ';
}
