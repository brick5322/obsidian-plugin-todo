import { TAbstractFile, TFile, Vault } from 'obsidian';
import { TodoTree } from './TodoTree';
import { Parser } from './Parser';

/**
 * Indexer - Listens to vault events and triggers TodoTree rebuild
 *
 * Events handled:
 * - create: New file created
 * - modify: File modified
 * - delete: File deleted
 * - rename: File renamed
 */
export class Indexer {
  private vault: Vault;
  private todoTree: TodoTree;
  private parser: Parser;
  private isPathExcluded: (path: string) => boolean;
  private registered: boolean = false;

  constructor(vault: Vault, todoTree: TodoTree, parser: Parser, isPathExcluded: (path: string) => boolean) {
    this.vault = vault;
    this.todoTree = todoTree;
    this.parser = parser;
    this.isPathExcluded = isPathExcluded;
  }

  /**
   * Update the exclusion filter
   */
  setExclusionFilter(isPathExcluded: (path: string) => boolean): void {
    this.isPathExcluded = isPathExcluded;
  }

  /**
   * Register vault event listeners
   */
  register(): void {
    if (this.registered) return;

    this.vault.on('create', this.onCreate.bind(this));
    this.vault.on('modify', this.onModify.bind(this));
    this.vault.on('delete', this.onDelete.bind(this));
    this.vault.on('rename', this.onRename.bind(this));

    this.registered = true;
  }

  /**
   * Unregister vault event listeners
   */
  unregister(): void {
    // Obsidian handles cleanup on plugin unload via plugin lifecycle
  }

  private async onCreate(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
      return;
    }
    // For new files, do a full rebuild to pick up all changes
    await this.fullRebuild();
  }

  private async onModify(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
      return;
    }
    // For modifications, do a full rebuild to ensure consistency
    await this.fullRebuild();
  }

  private async onDelete(path: string): Promise<void> {
    // For deletions, do a full rebuild
    await this.fullRebuild();
  }

  private async onRename(file: TAbstractFile, oldPath: string): Promise<void> {
    // For renames, do a full rebuild
    await this.fullRebuild();
  }

  private async fullRebuild(): Promise<void> {
    const files = this.vault.getMarkdownFiles();
    const allItems: import('./TodoItem').TodoItem[] = [];

    for (const f of files) {
      if (this.isPathExcluded(f.path)) continue;

      // Use read() instead of cachedRead() to ensure fresh content
      const content = await this.vault.read(f);
      const result = await this.parser.parseFile(f.path, content);
      allItems.push(...result.items);
    }

    this.todoTree.rebuild(allItems);
  }
}
