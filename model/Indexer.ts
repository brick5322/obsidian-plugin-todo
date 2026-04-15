import { TAbstractFile, TFile, Vault } from 'obsidian';
import { TodoTree } from './TodoTree';

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
  private registered: boolean = false;

  constructor(vault: Vault, todoTree: TodoTree) {
    this.vault = vault;
    this.todoTree = todoTree;
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

  private onCreate(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
      return;
    }
    this.todoTree.rebuild();
  }

  private onModify(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
      return;
    }
    this.todoTree.rebuild();
  }

  private onDelete(path: string): void {
    this.todoTree.rebuild();
  }

  private onRename(file: TAbstractFile, oldPath: string): void {
    this.todoTree.rebuild();
  }
}
