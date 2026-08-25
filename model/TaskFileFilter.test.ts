jest.mock(
  'obsidian',
  () => {
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

function setup(paths: string[], tagsByPath: Record<string, unknown> = {}) {
  const files = new Map(paths.map((path) => [path, makeFile(path)]));
  const vault = {
    getAbstractFileByPath: jest.fn((path: string) => files.get(path) ?? null),
  } as unknown as Vault;
  const metadataCache = {
    getFileCache: jest.fn((file: TFile): CachedMetadata | null =>
      file.path in tagsByPath
        ? ({ frontmatter: { tags: tagsByPath[file.path] } } as unknown as CachedMetadata)
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
