import { DateTime } from 'luxon';
import { TodoItem, TodoItemStatus } from './TodoItem';
import { TodoPluginSettings } from './TodoPluginSettings';
import { DateParser } from '../util/DateParser';
import { extractDueDateFromDailyNotesFile } from '../util/DailyNoteParser';

/**
 * TodoTree - Singleton that manages the task tree structure
 *
 * Provides:
 * - hashIndex: Map<string, TodoItem> (taskId → TodoItem)
 * - pathIndex: Map<string, TodoItem[]> (filePath → TodoItem[])
 * - fileDates: Map<string, DateTime> (for Daily Notes)
 * - rootIds: Set<string> (top-level task IDs)
 *
 * Tree building algorithm (from spec):
 * - Group items by file, sort by startIndex
 * - For each file, use a stack to determine parent/child relationships based on indentation
 */
export class TodoTree {
  // 索引
  private hashIndex: Map<string, TodoItem> = new Map();
  private pathIndex: Map<string, TodoItem[]> = new Map();

  // Daily Note 文件日期
  private fileDates: Map<string, DateTime> = new Map();

  // 树结构（基于 hash 引用，而非内存引用）
  private rootIds: Set<string> = new Set();

  // 监听器
  private listeners: ((tasks: TodoItem[]) => void)[] = [];

  // 配置
  private settings: TodoPluginSettings;

  // Date parser for actionDate calculation
  private dateParser: DateParser;

  constructor(settings: TodoPluginSettings) {
    this.settings = settings;
    this.dateParser = new DateParser(settings.dateTagFormat, settings.dateFormat);
  }

  /**
   * Update settings and optionally rebuild
   */
  setSettings(settings: TodoPluginSettings): void {
    this.settings = settings;
    this.dateParser = new DateParser(settings.dateTagFormat, settings.dateFormat);
  }

  /**
   * Rebuild the tree from parsed items
   */
  rebuild(items: TodoItem[]): void {
    this.hashIndex.clear();
    this.pathIndex.clear();
    this.fileDates.clear();
    this.rootIds.clear();

    // Group items by file
    const itemsByPath = new Map<string, TodoItem[]>();
    for (const item of items) {
      const pathItems = itemsByPath.get(item.sourceFilePath) || [];
      pathItems.push(item);
      itemsByPath.set(item.sourceFilePath, pathItems);
    }

    // Build tree for each file
    for (const [filePath, pathItems] of itemsByPath) {
      // Extract file date for daily notes
      const fileDate = extractDueDateFromDailyNotesFile(filePath);
      if (fileDate) {
        this.fileDates.set(filePath, fileDate);
      }

      // Sort by startIndex to process in line order
      pathItems.sort((a, b) => a.startIndex - b.startIndex);

      // Build tree using stack algorithm
      this.buildTreeForFile(pathItems);
    }

    this.invokeListeners();
  }

  /**
   * Rebuild items for a specific file only
   * Removes old items for this file and adds new ones
   * Preserves items from other files
   */
  rebuildForFile(filePath: string, items: TodoItem[]): void {
    // Remove old items for this file from indices
    const oldItems = this.pathIndex.get(filePath) || [];
    for (const item of oldItems) {
      this.hashIndex.delete(item.taskId);
      // If it was a root, remove from rootIds
      this.rootIds.delete(item.taskId);
    }
    this.pathIndex.delete(filePath);

    // Add new items
    // Sort by startIndex
    items.sort((a, b) => a.startIndex - b.startIndex);

    // Build tree for this file
    this.buildTreeForFile(items);

    // Re-add to pathIndex
    this.pathIndex.set(filePath, items);

    this.invokeListeners();
  }

  /**
   * Build tree for a single file using stack algorithm
   *
   * Indentation rules:
   * - Store raw indent (actual space count)
   * - Calculate level: same indent = same level, larger indent = deeper level
   * - Track all seen indents and their levels
   * - Valid nesting: child indent > parent indent
   * - Level skip error: indent not seen before AND not greater than max seen = error (treat as root)
   */
  private buildTreeForFile(items: TodoItem[]): void {
    const stack: { item: TodoItem; indent: number }[] = [];
    // Track indent -> level mapping for all seen indents
    const indentToLevel: Map<number, number> = new Map();
    let maxIndent = -1;

    for (const item of items) {
      const indent = item.indentation;

      // Determine level for this indent
      let level: number;
      if (indentToLevel.has(indent)) {
        // Seen before = same level
        level = indentToLevel.get(indent)!;
      } else if (indent > maxIndent) {
        // New indent larger than all seen = next level
        level = maxIndent === -1 ? 0 : indentToLevel.get(maxIndent)! + 1;
        indentToLevel.set(indent, level);
        maxIndent = indent;
      } else {
        // Error: indent not seen AND not greater than max
        // This is "层级跨越" - skip level error
        // Treat as root and mark parse error
        level = -1;
        item.parseError = '层级跨越：缩进级别跳跃';
      }

      // Find parent in stack
      if (level >= 0) {
        // Search stack for parent with smaller indent
        while (stack.length > 0) {
          const topIndent = stack[stack.length - 1].indent;
          if (topIndent < indent) {
            // Found valid parent
            const parent = stack[stack.length - 1].item;
            item.parentId = parent.taskId;
            parent.childIds.push(item.taskId);
            break;
          }
          stack.pop();
        }
      }

      if (!item.parentId) {
        // No valid parent = root item
        this.rootIds.add(item.taskId);
      }

      // Push to stack
      stack.push({ item, indent });

      // Add to indices
      this.hashIndex.set(item.taskId, item);
      const pathItems = this.pathIndex.get(item.sourceFilePath) || [];
      pathItems.push(item);
      this.pathIndex.set(item.sourceFilePath, pathItems);
    }
  }

  /**
   * Calculate actionDate in realtime (date inheritance from parent or daily note)
   */
  getActionDate(item: TodoItem): DateTime | undefined {
    // Parse date from originalDescription
    const selfDate = this.dateParser.parseDate(item.originalDescription);

    if (selfDate) {
      // If has parent, use min(selfDate, parent's actionDate)
      if (item.parentId) {
        const parent = this.hashIndex.get(item.parentId);
        if (parent) {
          const parentDate = this.getActionDate(parent);
          if (parentDate) {
            return selfDate < parentDate ? selfDate : parentDate;
          }
        }
      }
      return selfDate;
    }

    // No self date - inherit from parent
    if (item.parentId) {
      const parent = this.hashIndex.get(item.parentId);
      if (parent) {
        return this.getActionDate(parent);
      }
    }

    // Inherit from daily note file date
    const fileDate = this.fileDates.get(item.sourceFilePath);
    return fileDate;
  }

  /**
   * Complete a task with cascade to children
   * Only records direct completion (status = Done), not cascaded completion (status = CascadedDone)
   * Returns the items that should be recorded for daily report
   */
  completeTask(taskId: string): TodoItem[] {
    const item = this.hashIndex.get(taskId);
    if (!item) {
      return [];
    }

    const recordedItems: TodoItem[] = [];

    // Record the direct completion
    if (item.status === TodoItemStatus.Todo) {
      item.status = TodoItemStatus.Done;
      recordedItems.push(item);
    }

    // Cascade to children (but don't record them)
    this.cascadeToChildren(item, recordedItems);

    this.invokeListeners();
    return recordedItems;
  }

  /**
   * Cascade completion status to all children
   */
  private cascadeToChildren(item: TodoItem, recordedItems: TodoItem[]): void {
    for (const childId of item.childIds) {
      const child = this.hashIndex.get(childId);
      if (child && child.status === TodoItemStatus.Todo) {
        child.status = TodoItemStatus.CascadedDone;
        this.cascadeToChildren(child, recordedItems);
      }
    }
  }

  /**
   * Uncomplete a task - restore to Todo status
   * Cascades to children (CascadedDone → Todo)
   * May cascade up to parent if parent was Done
   */
  uncompleteTask(taskId: string): void {
    const item = this.hashIndex.get(taskId);
    if (!item) return;

    // If item was CascadedDone, it was a child - just restore to Todo
    if (item.status === TodoItemStatus.CascadedDone) {
      item.status = TodoItemStatus.Todo;
    } else if (item.status === TodoItemStatus.Done) {
      // Item was directly completed - restore to Todo
      item.status = TodoItemStatus.Todo;

      // Cascade up to parent (parent may need to become Todo if all children are unchecked)
      this.uncascadeToParent(item);
    }

    // Cascade down to children that were CascadedDone
    this.uncascadeChildren(item);

    this.invokeListeners();
  }

  /**
   * Restore children from CascadedDone to Todo
   */
  private uncascadeChildren(item: TodoItem): void {
    for (const childId of item.childIds) {
      const child = this.hashIndex.get(childId);
      if (child && child.status === TodoItemStatus.CascadedDone) {
        child.status = TodoItemStatus.Todo;
        this.uncascadeChildren(child);
      }
    }
  }

  /**
   * Check if parent should be restored to Todo (if all children are unchecked)
   */
  private uncascadeToParent(item: TodoItem): void {
    if (!item.parentId) return;

    const parent = this.hashIndex.get(item.parentId);
    if (!parent) return;

    // Check if all children are now Todo or have no pending children
    const allChildrenUncompleted = parent.childIds.every((childId) => {
      const child = this.hashIndex.get(childId);
      return !child || child.status === TodoItemStatus.Todo;
    });

    if (allChildrenUncompleted && parent.status === TodoItemStatus.Done) {
      parent.status = TodoItemStatus.Todo;
      // Continue cascading up
      this.uncascadeToParent(parent);
    }
  }

  /**
   * Get all root items
   */
  getRootItems(): TodoItem[] {
    return Array.from(this.rootIds).map(id => this.hashIndex.get(id)!).filter(Boolean);
  }

  /**
   * Get all items
   */
  getAllItems(): TodoItem[] {
    return Array.from(this.hashIndex.values());
  }

  /**
   * Get items by file path
   */
  getItemsByPath(filePath: string): TodoItem[] {
    return this.pathIndex.get(filePath) || [];
  }

  /**
   * Get a single item by taskId
   */
  getItem(taskId: string): TodoItem | undefined {
    return this.hashIndex.get(taskId);
  }

  /**
   * Subscribe to changes
   */
  subscribe(listener: (tasks: TodoItem[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners
   */
  private invokeListeners(): void {
    const allItems = this.getAllItems();
    for (const listener of this.listeners) {
      listener(allItems);
    }
  }
}