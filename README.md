# ToDone for VS Code

ToDone for VS Code is an unofficial VS Code port based on the original [ToDone](https://github.com/tiffon/sublime-to-done) package for Sublime Text by tiffon.

All credit for the ToDone format, its syntax and the idea behind it belongs to the original author. This project only brings that workflow to VS Code. It is not affiliated with or endorsed by the original project. If you use Sublime Text, the original package is available on [Package Control](https://packagecontrol.io/packages/ToDone).

## What ToDone is

ToDone is a way of keeping to-do lists in plain text files. A task is a line that starts with a priority marker, subtasks are indented beneath it, and notes sit next to or below the task they belong to. There is no database, no account and no sync service. The file is the list, and the editor adds the highlighting that makes it easy to read at a glance.

This port exists because the format works well and deserved a home in VS Code too. Your files stay exactly as they are, so the same list can be opened in Sublime Text with the original package or in VS Code with this one.

## File types

Files ending in `.todo` or `.todone` open as ToDone automatically. For any other file, choose **ToDone** from the language picker in the status bar.

## Priorities

There are five priority levels. Priority 5 is the most important and priority 1 is the least important. Each level can be written in two equivalent ways.

**Numeric form**

```text
-5 Priority 5
-4 Priority 4
-3 Priority 3
-2 Priority 2
-1 Priority 1
```

**Repeated-hyphen form**

```text
----- Priority 5
---- Priority 4
--- Priority 3
-- Priority 2
- Priority 1
```

Both forms are fully supported and are highlighted identically, so `-5` and `-----` look the same. You can mix them in one file. The marker must be followed by a space or a tab.

## States

A single character in front of the marker changes the state of a task. States work with both priority forms.

```text
-5 An active task
!-5 An emergency task
+-5 A completed task
.-5 A cancelled task
.-5 (no longer needed) A cancelled task with a reason
+!-5 A completed task that was an emergency
```

| Prefix | Meaning |
| --- | --- |
| `!` | Emergency. The task is emphasized. |
| `+` | Completed. The task and all of its subtasks are dimmed. |
| `.` | Cancelled. The task and all of its subtasks are dimmed. Text in parentheses right after the marker is shown as the reason. |

## Subtasks

Indent a task under another one to make it a subtask. Spaces and tabs both work. Completing or cancelling a task also applies to everything nested under it.

```text
-4 Parent task
    -3 Child task
        -2 Grandchild task
```

## Notes

A task can carry notes in three ways.

```text
-3 Task with an inline note: everything after the colon is a note

-3 Task with a note below it
    Indented lines that are not tasks are notes.

-3 Task with a raw note ///
    Everything between the slashes is a note,
    - including lines that look like tasks.
    ///
```

Text wrapped in backticks, such as `` `this` ``, is emphasized. URLs such as `https://example.com` can be used in a task title without starting a note.

## Headings

Any line that starts at the left margin and is not a task is treated as a heading. Text between `/*` and `*/` at the start of a line forms an offset heading, which may span several lines.

```text
Work
-3 Finish the report

/*
    Someday
*/
-1 Learn the cello
```

## Commands

All commands are available from the Command Palette under the **ToDone** category while a ToDone file is open. They work on every line touched by the selection, and on every cursor when you use multiple cursors.

| Command | What it does |
| --- | --- |
| ToDone: Toggle Completed | Adds or removes `+`. |
| ToDone: Toggle Emergency | Adds or removes `!`. |
| ToDone: Toggle Cancelled | Adds or removes `.`. |
| ToDone: Increase Priority | Raises the priority by one, up to 5. |
| ToDone: Decrease Priority | Lowers the priority by one, down to 1. |
| ToDone: Set Priority 1 to 5 | Sets an exact priority. On a plain line, this turns the line into a task. |

A few details worth knowing:

- Indentation, separators, titles, notes and cancellation reasons are never changed.
- Commands keep the notation you already use. Raising `-4` gives `-5`, and raising `----` gives `-----`. A numeric task never turns into hyphens unless you ask for it with the setting below.
- When a toggle runs on several tasks at once, it behaves like VS Code's comment toggle: the state is added to all of them unless they all have it already.
- Completed and cancelled are treated as alternatives. Completing a cancelled task removes the `.`, and cancelling a completed task removes the `+`.

### Keyboard shortcuts

The original package toggled completion with the comment shortcut, so this port does the same: **Ctrl+/** (**Cmd+/** on macOS) runs Toggle Completed, but only inside ToDone files. No other shortcuts are assigned by default. To add your own, open **Preferences: Open Keyboard Shortcuts (JSON)** and add entries such as these:

```json
[
  { "key": "ctrl+alt+up", "command": "todone.increasePriority", "when": "editorLangId == todone" },
  { "key": "ctrl+alt+down", "command": "todone.decreasePriority", "when": "editorLangId == todone" },
  { "key": "ctrl+alt+1", "command": "todone.setPriority1", "when": "editorLangId == todone" },
  { "key": "ctrl+alt+5", "command": "todone.setPriority5", "when": "editorLangId == todone" },
  { "key": "ctrl+alt+e", "command": "todone.toggleEmergency", "when": "editorLangId == todone" },
  { "key": "ctrl+alt+x", "command": "todone.toggleCancelled", "when": "editorLangId == todone" }
]
```

To remove the Ctrl+/ binding, add `{ "key": "ctrl+/", "command": "-todone.toggleCompleted" }` to the same file.

## Outline and navigation

Tasks and headings appear in the Outline view, in the breadcrumbs and in **Go to Symbol in Editor** (Ctrl+Shift+O). Subtasks are nested under their parents and tasks are grouped under their headings. As in the original package, completed and cancelled tasks are left out so the list shows current work. They can be brought back with the settings below.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `todone.priorityStyle` | `preserve` | How priority commands write markers. `preserve` keeps each task's current notation and uses the numeric form for new tasks. `numeric` always writes `-3`. `hyphens` always writes `---`. |
| `todone.outline.showCompletedTasks` | `false` | Show completed tasks in the outline. |
| `todone.outline.showCancelledTasks` | `false` | Show cancelled tasks in the outline. |

## Colors

ToDone does not change your color theme. Instead, each part of a task is tagged with scopes that common themes already color, so priorities, states and notes stay distinct in Dark Modern, Light Modern, Monokai, Solarized and other popular themes. Notes use the theme's comment color so they stay in the background.

If you would like specific colors, every token also carries a ToDone scope that you can target in your settings. For example, to get something close to the original Monokai-based palette:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "meta.title.priority-1", "settings": { "foreground": "#bbbbbb" } },
    { "scope": "meta.title.priority-2", "settings": { "foreground": "#c5ffa0" } },
    { "scope": "meta.title.priority-3", "settings": { "foreground": "#ae81ff" } },
    { "scope": "meta.title.priority-4", "settings": { "foreground": "#ffeb3f" } },
    { "scope": "meta.title.priority-5", "settings": { "foreground": "#f92672", "fontStyle": "bold" } },
    { "scope": "meta.note.todone", "settings": { "foreground": "#75715e" } },
    { "scope": "meta.heading.todone", "settings": { "foreground": "#66d9ef" } }
  ]
}
```

Run **Developer: Inspect Editor Tokens and Scopes** on any part of a task to see the scopes it carries.

## Installation

Once the extension is published, it can be installed from the Extensions view by searching for "ToDone for VS Code".

### Installing from a VSIX file

To install a locally built package, run the following in PowerShell from the project folder:

```powershell
npm install
npx @vscode/vsce package
code --install-extension .\todone-vscode-0.1.0.vsix
```

You can also use **Extensions: Install from VSIX...** from the Command Palette.

## Development

```powershell
npm install
npm test                  # lint, grammar check, unit and grammar tests
npm run test:integration  # runs the extension tests inside a downloaded copy of VS Code
```

To try the extension from source, open the project folder in VS Code, run `npm install` once, then press F5 (or choose **Run Extension** in the Run and Debug view). A second VS Code window titled "[Extension Development Host]" opens with the extension loaded and the sample files from `test/fixtures` in the Explorer. Open `spec.todo` or `original-readme.todo` to see the highlighting, and try the **ToDone:** commands from the Command Palette. The **Extension Tests** configuration runs the integration tests in the same way.

The grammar in `syntaxes/todone.tmLanguage.json` is generated by `scripts/build-grammar.js`, so edit the script and run `npm run grammar` rather than editing the JSON by hand.

## Known differences from Sublime ToDone

- **Blank lines inside a task.** In the original package, a blank line ended a task's block, so a completed or cancelled state did not carry over to subtasks that came after a blank line. Here, nesting is decided by indentation alone, so those subtasks are dimmed as well. The outline uses the same rule.
- **Numeric markers on finished tasks.** The original grammar did not fully recognize forms such as `+-5`, and subtasks written as `-3` inside a completed or cancelled task only had their hyphen styled. Both are handled consistently here.
- **Emphasis in titles.** Backtick emphasis is also highlighted in task titles, not only in notes.
- **Completed titles** are shown with a strikethrough in themes that support it.
- **Backgrounds.** VS Code themes cannot give individual tokens a background color, so the original's highlighted backgrounds for emergency and priority 5 tasks are shown with bold text and the theme's error color instead.
- **No forced settings.** The original package set an 8-column hard-tab layout and its own color scheme. This port leaves your editor settings and theme alone.

## Credits and license

ToDone was created by Joe Farro ([tiffon](https://github.com/tiffon)) for Sublime Text and is released under the MIT License. The grammar in this extension is a port of the original `ToDone.tmLanguage`, and its license notice is included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The test fixture `test/fixtures/original-readme.todo` is adapted from the original package's `readme.todo`.

- Original repository: <https://github.com/tiffon/sublime-to-done>
- Package Control: <https://packagecontrol.io/packages/ToDone>

This extension is released under the [MIT License](LICENSE).
