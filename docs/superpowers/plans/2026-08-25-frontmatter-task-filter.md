# Frontmatter Task Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter indexed task files using a nearest-wins `gtd.task` boolean frontmatter property inherited from folder notes.

> **Amendment (2026-08-25):** The implemented directive changed from tags to the dotted boolean property `gtd.task`. `true` includes, `false` excludes, and a missing or non-boolean value inherits. The tag-based snippets below document the original RED/GREEN plan; the final source and tests contain the amended implementation.

**Architecture:** Add a focused `TaskFileFilter` that resolves directives through Obsidian's `MetadataCache`. Inject it into `Indexer`, make `Indexer.rebuild()` the only full-scan entry point, and rebuild after metadata-cache changes so updated inherited rules are eventually applied.

**Tech Stack:** TypeScript 4, Obsidian API, Jest 26, ts-jest, Rollup

---

## File Structure

- Create `model/TaskFileFilter.ts` for directive resolution.
- Create `model/TaskFileFilter.test.ts` for precedence and edge cases.
- Create `model/Indexer.test.ts` for scan and event integration.
- Modify `model/Indexer.ts` to apply the filter and own rebuilds.
- Modify `main.ts` to construct and wire the filter.

### Task 1: Resolve nearest frontmatter directive

**Files:**
- Create: `model/TaskFileFilter.test.ts`
- Create: `model/TaskFileFilter.ts`

- [ ] **Step 1: Write the failing tests**

Create `model/TaskFileFilter.test.ts`. Mock Obsidian's runtime class and tag parser, then cover default inclusion, file directives, folder inheritance, nearest-wins precedence, conflicts, leading `#`, and path de-duplication:

```typescript
jest.mock('obsidian', () => {
  class TFile {}
  return {
    TFile,
    parseFrontMatterTags: (frontmatter: { tags?: unknown } | null): string[] | null => {
      if (!frontmatter || frontmatter.tags === undefined) return null;
      if (Array.isArray(frontmatter.tags)) return frontmatter.tags as string[];
      if (typeof frontmatter.tags === 'string') {
        return frontmatter.tags.split(/[\s,]+/).filter(Boolean);
      }
      return null;
    },
  };
});

import { CachedMetadata, MetadataCache, TFile, Vault } from 'obsidian';
import { TaskFileFilter } from './TaskFileFilter';

function makeFile(path: string): TFile {
  const name = path.substring(path.lastIndexOf('/') + 1);
  return Object.assign(new TFile(), {
    path,
    name,
    basename: name.replace(/\.md$/, ''),
    extension: 'md',
  }) as TFile;
}

function setup(paths: string[], tagsByPath: Record<string, unknown> = {}) {
  const files = new Map(paths.map((path) => [path, makeFile(path)]));
  const vault = {
    getAbstractFileByPath: jest.fn((path: string) => files.get(path) ?? null),
  } as unknown as Vault;
  const metadataCache = {
    getFileCache: jest.fn((file: TFile): CachedMetadata | null =>
      file.path in tagsByPath
        ? ({ frontmatter: { tags: tagsByPath[file.path] } } as CachedMetadata)
        : null,
    ),
  } as unknown as MetadataCache;
  return { files, filter: new TaskFileFilter(vault, metadataCache), metadataCache };
}

describe('TaskFileFilter', () => {
  test('includes when no directive exists', () => {
    const ctx = setup(['Projects/Alpha/Note.md']);
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(true);
  });

  test.each([
    [['gtd.task'], true],
    [['gtd.no-task'], false],
  ])('uses a directive on the file itself', (tags, expected) => {
    const ctx = setup(['Note.md'], { 'Note.md': tags });
    expect(ctx.filter.shouldInclude(ctx.files.get('Note.md')!)).toBe(expected);
  });

  test('inherits from the nearest folder note', () => {
    const ctx = setup(
      ['Projects/Alpha/Note.md', 'Projects/Alpha/Alpha.md'],
      { 'Projects/Alpha/Alpha.md': ['gtd.no-task'] },
    );
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(false);
  });

  test('near task overrides far no-task', () => {
    const ctx = setup(
      ['Projects/Alpha/Note.md', 'Projects/Alpha/Alpha.md', 'Projects/Projects.md'],
      {
        'Projects/Alpha/Alpha.md': ['gtd.task'],
        'Projects/Projects.md': ['gtd.no-task'],
      },
    );
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(true);
  });

  test('file directive overrides folder directive', () => {
    const ctx = setup(
      ['Projects/Alpha/Note.md', 'Projects/Alpha/Alpha.md'],
      {
        'Projects/Alpha/Note.md': ['gtd.task'],
        'Projects/Alpha/Alpha.md': ['gtd.no-task'],
      },
    );
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(true);
  });

  test('no-task wins a same-level conflict and accepts leading hashes', () => {
    const ctx = setup(['Note.md'], { 'Note.md': ['#gtd.task', '#gtd.no-task'] });
    expect(ctx.filter.shouldInclude(ctx.files.get('Note.md')!)).toBe(false);
  });

  test('does not inspect a folder note twice when it is the target', () => {
    const ctx = setup(
      ['Projects/Alpha/Alpha.md', 'Projects/Projects.md'],
      { 'Projects/Alpha/Alpha.md': ['gtd.task'], 'Projects/Projects.md': ['gtd.no-task'] },
    );
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Alpha.md')!)).toBe(true);
    expect(ctx.metadataCache.getFileCache).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npm test -- --runInBand model/TaskFileFilter.test.ts`.

Expected: FAIL because `./TaskFileFilter` does not exist.

- [ ] **Step 3: Implement the filter**

Create `model/TaskFileFilter.ts`:

```typescript
import { MetadataCache, parseFrontMatterTags, TFile, Vault } from 'obsidian';

type TaskDirective = 'include' | 'exclude';

export class TaskFileFilter {
  constructor(private vault: Vault, private metadataCache: MetadataCache) {}

  shouldInclude(file: TFile): boolean {
    for (const candidate of this.getCandidates(file)) {
      const directive = this.getDirective(candidate);
      if (directive) return directive === 'include';
    }
    return true;
  }

  private getCandidates(file: TFile): TFile[] {
    const candidates = [file];
    const seen = new Set<string>([file.path]);
    const directories = file.path.split('/');
    directories.pop();

    for (let depth = directories.length; depth > 0; depth--) {
      const directoryPath = directories.slice(0, depth).join('/');
      const directoryName = directories[depth - 1];
      const notePath = `${directoryPath}/${directoryName}.md`;
      if (seen.has(notePath)) continue;
      seen.add(notePath);
      const candidate = this.vault.getAbstractFileByPath(notePath);
      if (candidate instanceof TFile) candidates.push(candidate);
    }
    return candidates;
  }

  private getDirective(file: TFile): TaskDirective | undefined {
    const frontmatter = this.metadataCache.getFileCache(file)?.frontmatter;
    const tags = parseFrontMatterTags(frontmatter ?? null) ?? [];
    const normalized = new Set(tags.map((tag) => tag.replace(/^#/, '')));
    if (normalized.has('gtd.no-task')) return 'exclude';
    if (normalized.has('gtd.task')) return 'include';
    return undefined;
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run `npm test -- --runInBand model/TaskFileFilter.test.ts`.

Expected: PASS, 8 tests passed (`test.each` contributes two cases).

- [ ] **Step 5: Commit the isolated unit**

```bash
git add model/TaskFileFilter.ts model/TaskFileFilter.test.ts
git commit -m "feat(model): add frontmatter task file filter"
```

### Task 2: Apply the filter in Indexer

**Files:**
- Create: `model/Indexer.test.ts`
- Modify: `model/Indexer.ts`

- [ ] **Step 1: Write failing Indexer tests**

Create `model/Indexer.test.ts` with a mocked `TFile` and narrow doubles. Build three files: included, frontmatter-excluded, and settings-excluded. Assert:

```typescript
await indexer.rebuild();
expect(filter.shouldInclude).toHaveBeenCalledTimes(2);
expect(parser.parseFile).toHaveBeenCalledTimes(1);
expect(vault.read).toHaveBeenCalledTimes(1);
expect(todoTree.rebuild).toHaveBeenCalledWith([]);
```

Capture the callback registered through `metadataCache.on('changed', callback)` and assert:

```typescript
indexer.register();
await changedCallback(makeFile('folder/folder.md'));
expect(todoTree.rebuild).toHaveBeenCalledTimes(1);
```

Finally call `unregister()` and assert four Vault event refs and one MetadataCache event ref are passed to their respective `offref()` methods.

- [ ] **Step 2: Verify RED**

Run `npm test -- --runInBand model/Indexer.test.ts`.

Expected: FAIL because the constructor lacks metadata/filter dependencies and `rebuild` is private.

- [ ] **Step 3: Implement Indexer integration**

Change the constructor to accept `MetadataCache` and `TaskFileFilter`. Store event refs from four Vault listeners and one MetadataCache `changed` listener. Make `rebuild()` public and implement its loop in this order:

```typescript
public async rebuild(): Promise<void> {
  const allItems: TodoItem[] = [];
  for (const file of this.vault.getMarkdownFiles()) {
    if (this.isPathExcluded(file.path)) continue;
    if (!this.taskFileFilter.shouldInclude(file)) continue;
    const content = await this.vault.read(file);
    const result = await this.parser.parseFile(file.path, content);
    allItems.push(...result.items);
  }
  this.todoTree.rebuild(allItems);
}
```

All Vault callbacks and the metadata callback call `await this.rebuild()`. `unregister()` calls `offref()` for the stored refs, clears both arrays, and resets `registered` to `false`.

- [ ] **Step 4: Verify GREEN**

Run `npm test -- --runInBand model/TaskFileFilter.test.ts model/Indexer.test.ts`.

Expected: PASS, 11 tests passed.

- [ ] **Step 5: Commit Indexer integration**

```bash
git add model/Indexer.ts model/Indexer.test.ts
git commit -m "feat(model): apply frontmatter filter during indexing"
```

### Task 3: Wire the plugin

**Files:**
- Modify: `main.ts`

- [ ] **Step 1: Verify the integration is RED**

Run `npm run build` before editing `main.ts`.

Expected: FAIL because `main.ts` calls the old `Indexer` constructor.

- [ ] **Step 2: Construct and pass the filter**

Add:

```typescript
import { TaskFileFilter } from './model/TaskFileFilter';
```

Construct the dependencies with:

```typescript
const taskFileFilter = new TaskFileFilter(this.app.vault, this.app.metadataCache);
this.indexer = new Indexer(
  this.app.vault,
  this.app.metadataCache,
  this.todoTree,
  this.parser,
  (path) => this.isPathExcluded(path),
  taskFileFilter,
);
```

In `onLayoutReady`, replace `triggerIndex()` with:

```typescript
await this.indexer.rebuild();
this.indexer.register();
```

Delete the duplicated private `triggerIndex()` method.

- [ ] **Step 3: Verify GREEN**

Run `npm run build`.

Expected: Rollup exits with code 0 without feature-related TypeScript errors.

- [ ] **Step 4: Commit only the feature hunk**

`main.ts` already contains unrelated uncommitted daily-report removal. Run `git diff -- main.ts`, use `git add -p -- main.ts`, and inspect `git diff --cached -- main.ts`. Stage only the new import, constructor wiring, layout-ready calls, and deleted duplicate scan method. Split mixed hunks; do not stage pre-existing work.

Commit with `git commit -m "feat: wire frontmatter filtering into plugin"`.

### Task 4: Full verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all tests**

Run `npm test -- --runInBand`.

Expected: all suites and tests pass.

- [ ] **Step 2: Run the production build**

Run `npm run build`.

Expected: exit code 0.

- [ ] **Step 3: Check feature formatting and whitespace**

Run:

```bash
npx prettier --check model/TaskFileFilter.ts model/TaskFileFilter.test.ts model/Indexer.ts model/Indexer.test.ts main.ts
git diff --check
```

Expected: both commands exit code 0. Format feature-touched lines only if needed.

- [ ] **Step 4: Audit repository state**

Run `git status --short` and `git log --oneline -5`.

Expected: feature work is committed; pre-existing daily-report removal changes, `data.json`, `.claude/`, and unrelated files remain preserved.
