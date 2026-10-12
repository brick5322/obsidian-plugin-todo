jest.mock(
  'obsidian',
  () => {
    class TFile {}
    return {
      TFile,
    };
  },
  { virtual: true },
);

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

function setup(paths: string[], frontmatterByPath: Record<string, Record<string, unknown>> = {}) {
  const files = new Map(paths.map((path) => [path, makeFile(path)]));
  const vault = {
    getAbstractFileByPath: jest.fn((path: string) => files.get(path) ?? null),
  } as unknown as Vault;
  const metadataCache = {
    getFileCache: jest.fn((file: TFile): CachedMetadata | null =>
      file.path in frontmatterByPath
        ? ({ frontmatter: frontmatterByPath[file.path] } as unknown as CachedMetadata)
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
    [true, true],
    [false, false],
  ])('uses a boolean directive on the file itself', (directive, expected) => {
    const ctx = setup(['Note.md'], { 'Note.md': { 'gtd.task': directive } });
    expect(ctx.filter.shouldInclude(ctx.files.get('Note.md')!)).toBe(expected);
  });

  test('inherits from the nearest folder note', () => {
    const ctx = setup(['Projects/Alpha/Note.md', 'Projects/Alpha/Alpha.md'], {
      'Projects/Alpha/Alpha.md': { 'gtd.task': false },
    });
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(false);
  });

  test('near task overrides far no-task', () => {
    const ctx = setup(['Projects/Alpha/Note.md', 'Projects/Alpha/Alpha.md', 'Projects/Projects.md'], {
      'Projects/Alpha/Alpha.md': { 'gtd.task': true },
      'Projects/Projects.md': { 'gtd.task': false },
    });
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(true);
  });

  test('file directive overrides folder directive', () => {
    const ctx = setup(['Projects/Alpha/Note.md', 'Projects/Alpha/Alpha.md'], {
      'Projects/Alpha/Note.md': { 'gtd.task': true },
      'Projects/Alpha/Alpha.md': { 'gtd.task': false },
    });
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(true);
  });

  test('ignores a non-boolean directive and continues to the parent', () => {
    const ctx = setup(['Projects/Alpha/Note.md', 'Projects/Alpha/Alpha.md'], {
      'Projects/Alpha/Note.md': { 'gtd.task': 'true' },
      'Projects/Alpha/Alpha.md': { 'gtd.task': false },
    });
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Note.md')!)).toBe(false);
  });

  test('does not inspect a folder note twice when it is the target', () => {
    const ctx = setup(['Projects/Alpha/Alpha.md', 'Projects/Projects.md'], {
      'Projects/Alpha/Alpha.md': { 'gtd.task': true },
      'Projects/Projects.md': { 'gtd.task': false },
    });
    expect(ctx.filter.shouldInclude(ctx.files.get('Projects/Alpha/Alpha.md')!)).toBe(true);
    expect(ctx.metadataCache.getFileCache).toHaveBeenCalledTimes(1);
  });
});
