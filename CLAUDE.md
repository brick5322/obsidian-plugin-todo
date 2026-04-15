# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian plugin for text-based GTD (Getting Things Done). Collects all TODOs from the vault and displays them in categorized views: Today, Scheduled, Inbox, and Someday/Maybe.

**Entry point**: `main.ts` - TodoPlugin class that extends Obsidian's Plugin

## Commands

```bash
npm run build     # Build with rollup (outputs to main.js)
npm run dev       # Watch mode for development
npm run lint      # Lint with eslint --fix
npm run lint-on-ci  # Lint without auto-fix (for CI)
npm run test      # Run Jest tests
```

**Run a single test file**:
```bash
npx jest model/TodoParser.test.ts
```

## Architecture

```
Vault (Obsidian)
    │
    ▼
TodoIndex ──────────────────────► TodoPlugin ─────► TodoItemView
(parses all markdown files,      (orchestrator,     (renders the UI
 maintains Map<path,TodoItem[]>)  settings, daily     with toolbar,
                                    report)          filtered lists)
    │
    ▼
TodoParser ──► DateParser ──► DateFormatter
(extracts TODO syntax,         (parses #date%     (formats dates
 handles parent/child trees)     tags)               for display)
```

**Key files**:
- `main.ts` - Plugin entry point, registers view and settings tab
- `model/TodoIndex.ts` - Scans vault, maintains todo map, listens to vault events
- `model/TodoParser.ts` - Parses `- [ ]` or `* [ ]` syntax, builds parent/child tree
- `model/TodoItem.ts` - Data model with status, description, actionDate, children
- `ui/TodoItemView.ts` - Obsidian ItemView subclass, renders 4-pane UI
- `ui/SettingsTab.ts` - Plugin settings UI
- `util/DateParser.ts` - Parses `#%date%` tags from task descriptions
- `util/DateFormatter.ts` - Formats dates using Luxon
- `lang/` - i18n helpers and locale files (en, zh-cn)

**Build output**: Rollup bundles `main.ts` into `main.js` (CJS format). The plugin is loaded by Obsidian via `manifest.json`.

## Date Inheritance Logic

When a TODO has no explicit date, it inherits from:
1. Parent task's actionDate (if parent exists)
2. Daily note's date (if file is a daily note)
3. Otherwise unscheduled (Inbox)

## Testing

Jest tests mock `DailyNoteParser` via `util/__mocks__/DailyNoteParser.ts`. Tests focus on date parsing and task tree building.
