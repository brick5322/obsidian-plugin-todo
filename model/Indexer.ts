import { EventRef, MetadataCache, TAbstractFile, TFile, Vault } from 'obsidian';
import { Parser } from './Parser';
import { TaskFileFilter } from './TaskFileFilter';
import { TodoItem } from './TodoItem';
import { TodoTree } from './TodoTree';

/**
 * Listens to Vault and metadata events and rebuilds the task tree.
 */
export class Indexer {
  private registered = false;
  private vaultEventRefs: EventRef[] = [];
  private metadataEventRefs: EventRef[] = [];

  constructor(
    private vault: Vault,
    private metadataCache: MetadataCache,
    private todoTree: TodoTree,
    private parser: Parser,
    private isPathExcluded: (path: string) => boolean,
    private taskFileFilter: TaskFileFilter,
  ) {}

  setExclusionFilter(isPathExcluded: (path: string) => boolean): void {
    this.isPathExcluded = isPathExcluded;
  }

  register(): void {
    if (this.registered) return;

    this.vaultEventRefs = [
      this.vault.on('create', this.onCreate.bind(this)),
      this.vault.on('modify', this.onModify.bind(this)),
      this.vault.on('delete', this.onDelete.bind(this)),
      this.vault.on('rename', this.onRename.bind(this)),
    ];
    this.metadataEventRefs = [this.metadataCache.on('changed', this.onMetadataChanged.bind(this))];
    this.registered = true;
  }

  unregister(): void {
    this.vaultEventRefs.forEach((ref) => this.vault.offref(ref));
    this.metadataEventRefs.forEach((ref) => this.metadataCache.offref(ref));
    this.vaultEventRefs = [];
    this.metadataEventRefs = [];
    this.registered = false;
  }

  async rebuild(): Promise<void> {
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

  private async onCreate(file: TAbstractFile): Promise<void> {
    if (file instanceof TFile && file.path.endsWith('.md')) await this.rebuild();
  }

  private async onModify(file: TAbstractFile): Promise<void> {
    if (file instanceof TFile && file.path.endsWith('.md')) await this.rebuild();
  }

  private async onDelete(): Promise<void> {
    await this.rebuild();
  }

  private async onRename(): Promise<void> {
    await this.rebuild();
  }

  private async onMetadataChanged(): Promise<void> {
    await this.rebuild();
  }
}
