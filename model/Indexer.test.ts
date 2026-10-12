jest.mock(
  'obsidian',
  () => ({
    TFile: class TFile {},
    parseFrontMatterTags: jest.fn(),
  }),
  { virtual: true },
);

import { EventRef, MetadataCache, TFile, Vault } from 'obsidian';
import { Indexer } from './Indexer';
import { Parser } from './Parser';
import { TaskFileFilter } from './TaskFileFilter';
import { TodoTree } from './TodoTree';

function makeFile(path: string): TFile {
  return Object.assign(new TFile(), {
    path,
    name: path,
    basename: path.replace(/\.md$/, ''),
    extension: 'md',
  }) as TFile;
}

function setup() {
  const included = makeFile('included.md');
  const frontmatterExcluded = makeFile('frontmatter-excluded.md');
  let metadataChanged: ((file: TFile) => Promise<void>) | undefined;

  const vault = {
    getMarkdownFiles: jest.fn(() => [included, frontmatterExcluded]),
    read: jest.fn(async (file: TFile) => `- [ ] ${file.path}`),
    on: jest.fn(() => ({} as EventRef)),
    offref: jest.fn(),
  } as unknown as Vault;
  const metadataCache = {
    on: jest.fn((name: string, callback: (file: TFile) => Promise<void>) => {
      if (name === 'changed') metadataChanged = callback;
      return {} as EventRef;
    }),
    offref: jest.fn(),
  } as unknown as MetadataCache;
  const todoTree = { rebuild: jest.fn() } as unknown as TodoTree;
  const parser = {
    parseFile: jest.fn(async () => ({ items: [], errors: [] })),
  } as unknown as Parser;
  const filter = {
    shouldInclude: jest.fn((file: TFile) => file !== frontmatterExcluded),
  } as unknown as TaskFileFilter;
  const indexer = new Indexer(vault, metadataCache, todoTree, parser, filter);

  return {
    indexer,
    vault,
    metadataCache,
    parser,
    filter,
    todoTree,
    getMetadataChanged: () => metadataChanged,
  };
}

describe('Indexer', () => {
  test('applies frontmatter filtering before parsing', async () => {
    const { indexer, vault, parser, filter, todoTree } = setup();

    await indexer.rebuild();

    expect(filter.shouldInclude).toHaveBeenCalledTimes(2);
    expect(parser.parseFile).toHaveBeenCalledTimes(1);
    expect(vault.read).toHaveBeenCalledTimes(1);
    expect(todoTree.rebuild).toHaveBeenCalledWith([]);
  });

  test('rebuilds after metadata cache changes', async () => {
    const { indexer, getMetadataChanged, todoTree } = setup();
    indexer.register();

    await getMetadataChanged()!(makeFile('folder/folder.md'));

    expect(todoTree.rebuild).toHaveBeenCalledTimes(1);
  });

  test('unregisters vault and metadata event references', () => {
    const { indexer, vault, metadataCache } = setup();
    indexer.register();

    indexer.unregister();

    expect(vault.offref).toHaveBeenCalledTimes(4);
    expect(metadataCache.offref).toHaveBeenCalledTimes(1);
  });
});
