/**
 * Builds the document outline (used by the Outline view, breadcrumbs and
 * "Go to Symbol in Editor"). Like the Goto list in the original Sublime
 * package, completed and cancelled tasks are left out by default so the list
 * focuses on current work.
 */
import { headingText, indentWidth, LineInfo, Priority } from './parser';

export interface OutlineOptions {
  tabSize: number;
  showCompleted: boolean;
  showCancelled: boolean;
}

export interface OutlineNode {
  kind: 'heading' | 'task';
  name: string;
  detail: string;
  /** First line of the node. */
  line: number;
  /** Last non-blank line that belongs to the node (its notes and subtasks). */
  endLine: number;
  /** Columns of the name on `line`, used for the selection range. */
  nameStart: number;
  nameEnd: number;
  priority?: Priority;
  emergency?: boolean;
  completed?: boolean;
  cancelled?: boolean;
  children: OutlineNode[];
}

interface Open {
  node: OutlineNode | undefined; // undefined for a hidden (filtered) task
  width: number; // indentation width; -1 for headings
}

export function buildOutline(lines: readonly string[], infos: readonly LineInfo[], opts: OutlineOptions): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: Open[] = [];
  let lastContent = -1;

  const close = (keep: (o: Open) => boolean) => {
    while (stack.length && !keep(stack[stack.length - 1])) {
      const open = stack.pop() as Open;
      if (open.node) {
        open.node.endLine = Math.max(open.node.line, lastContent);
      }
    }
  };

  const attach = (node: OutlineNode) => {
    const parent = stack.length ? stack[stack.length - 1] : undefined;
    if (parent?.node) {
      parent.node.children.push(node);
    } else {
      roots.push(node);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const info = infos[i];

    if (info.kind === 'blank') {
      continue;
    }
    if (info.kind === 'raw') {
      lastContent = i;
      continue;
    }

    if (info.kind === 'heading' || info.kind === 'heading-block') {
      const isContinuation = info.kind === 'heading-block' && i > 0 && infos[i - 1].kind === 'heading-block' && !lines[i - 1].includes('*/');
      if (isContinuation) {
        // Extra lines of a multi-line /* ... */ heading extend its name.
        const current = stack[0]?.node;
        const extra = headingText(text);
        if (current && extra) {
          current.name = current.name ? `${current.name} ${extra}` : extra;
        }
        lastContent = i;
        continue;
      }
      close(() => false);
      const name = headingText(text);
      const nameStart = Math.max(0, text.indexOf(name));
      const node: OutlineNode = {
        kind: 'heading',
        name,
        detail: '',
        line: i,
        endLine: i,
        nameStart,
        nameEnd: nameStart + name.length,
        children: [],
      };
      roots.push(node);
      stack.push({ node, width: -1 });
      lastContent = i;
      continue;
    }

    const width = indentWidth(text, opts.tabSize);
    // Notes belong to whatever is open; they only extend its range.
    if (info.kind === 'note') {
      close((o) => o.width < width);
      lastContent = i;
      continue;
    }

    const task = info.task;
    if (!task) {
      lastContent = i;
      continue;
    }
    close((o) => o.width < width);
    lastContent = i;

    const parent = stack.length ? stack[stack.length - 1] : undefined;
    const hiddenByParent = parent !== undefined && parent.node === undefined;
    const hidden =
      hiddenByParent ||
      (task.completed && !opts.showCompleted) ||
      (task.cancelled && !opts.showCancelled);
    if (hidden) {
      stack.push({ node: undefined, width });
      continue;
    }

    const name = task.title || '(untitled task)';
    const flags: string[] = [];
    if (task.emergency) {
      flags.push('emergency');
    }
    if (task.completed) {
      flags.push('completed');
    }
    if (task.cancelled) {
      flags.push(task.reason ? `cancelled (${task.reason})` : 'cancelled');
    }
    const node: OutlineNode = {
      kind: 'task',
      name,
      detail: [`priority ${task.priority}`, ...flags].join(', '),
      line: i,
      endLine: i,
      nameStart: task.title ? task.titleStart : task.indent.length,
      nameEnd: task.title ? task.titleEnd : text.length,
      priority: task.priority,
      emergency: task.emergency,
      completed: task.completed,
      cancelled: task.cancelled,
      children: [],
    };
    attach(node);
    stack.push({ node, width });
  }
  close(() => false);
  fillEmptyNames(roots);
  return roots;
}

/** VS Code rejects symbols with empty names, e.g. a lone `/*` line. */
function fillEmptyNames(nodes: OutlineNode[]): void {
  for (const node of nodes) {
    if (!node.name) {
      node.name = node.kind === 'heading' ? '(heading)' : '(untitled task)';
    }
    fillEmptyNames(node.children);
  }
}
