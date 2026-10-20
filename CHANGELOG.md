# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.2] - 2026-10-20

### Changed

- Rewrote the README with screenshots, a quick start guide and an animated demo of the commands.

## [0.2.1] - 2026-10-20

### Changed

- New extension icon and a matching Marketplace banner color.

## [0.2.0] - 2026-10-20

### Added

- Built-in colors for priorities, states, notes and headings that stay distinct in any color theme, with defaults for dark, light and high contrast themes. Each color can be changed under `workbench.colorCustomizations`.
- `todone.colors` setting to switch back to the color theme's own colors.
- Emergency tasks show the `!` on a red background, as in the original package.
- Text wrapped in backticks inside notes is shown in its own color, as in the original package.

### Fixed

- Priorities were hard or impossible to tell apart in color themes that give the grammar's scopes the same color.

## [0.1.0] - 2026-10-20

First release.

### Added

- ToDone language support for `.todo` and `.todone` files, ported from the original ToDone grammar for Sublime Text.
- Numeric (`-1` to `-5`) and repeated-hyphen (`-` to `-----`) priorities, highlighted identically.
- Emergency (`!`), completed (`+`) and cancelled (`.`) states, including combinations with numeric markers such as `+-5` and `.!-4`, and cancellation reasons.
- Nested subtasks, inline notes, indented notes, `///` raw notes, backtick emphasis, headings and `/* */` offset headings.
- Commands to toggle states and to raise, lower or set priorities while preserving the notation in use.
- `todone.priorityStyle` setting.
- Outline, breadcrumbs and Go to Symbol support that leaves out completed and cancelled tasks by default.
- Ctrl+/ (Cmd+/ on macOS) toggles completion inside ToDone files.
- Extension icon and a launch configuration for running the extension from source.
