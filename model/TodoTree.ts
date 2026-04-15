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
   * Build tree for a single file using stack algorithm
   */
  private buildTreeForFile(items: TodoItem[]): void {
    const stack: { item: TodoItem; indentLength: number }[] = [];

    for (const item of items) {
      // Calculate indent length from indentation level
      // Assuming indentation is 0 for root, 1 for first level, etc.
      // Each level is 2 spaces (standard markdown list indent)
      const indentLength = item.indentation * 2;

      // Pop from stack until we find a parent with strictly less indentation
      while (
        stack.length > 0 &&
        stack[stack.length - 1].indentLength >= indentLength
      ) {
        stack.pop();
      }

      const parent = stack.length > 0 ? stack[stack.length - 1].item : undefined;

      if (parent) {
        // Set parent/child relationship
        item.parentId = parent.taskId;
        parent.childIds.push(item.taskId);
      } else {
        // This is a root item
        this.rootIds.add(item.taskId);
      }

      // Push to stack as potential parent
      stack.push({ item, indentLength });

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