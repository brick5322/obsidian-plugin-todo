import { App, Plugin, PluginManifest, TFile, WorkspaceLeaf, Notice } from 'obsidian';
import { VIEW_TYPE_TODO } from './constants';
import { TodoItemView, TodoItemViewProps } from './ui/TodoItemView';
import { TodoItem, TodoItemStatus } from './model/TodoItem';
import { TodoTree } from './model/TodoTree';
import { Parser } from './model/Parser';
import { Indexer } from './model/Indexer';
import { TodoPluginSettings, DEFAULT_SETTINGS, CompletedTaskRecord } from './model/TodoPluginSettings';
import { SettingsTab } from './ui/SettingsTab';
import { DateFormatter } from 'util/DateFormatter';
import { DateTime } from 'luxon';
import { DateParser } from './util/DateParser';
import { relativeDateEditorExtension } from './util/RelativeDateDecoration';
import { t } from './lang/helpers';

// obsidian 0.12 类型缺编辑器扩展 API；运行时(Obsidian 1.x, CM6 编辑器)内置 registerEditorExtension，故在此补类型
declare module 'obsidian' {
  interface Plugin {
    registerEditorExtension(extension: unknown): void;
  }
}

export default class TodoPlugin extends Plugin {
  private dateFormatter: DateFormatter;
  private todoTree: TodoTree;
  private indexer: Indexer;
  private parser: Parser;
  private view: TodoItemView;
  private settings: TodoPluginSettings;
  private dateParser: DateParser;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.settings = DEFAULT_SETTINGS;
    this.todoTree = new TodoTree(this.settings);
    this.dateParser = new DateParser(this.settings.dateTagFormat, this.settings.dateFormat);
    this.parser = new Parser(this.dateParser);
    this.indexer = new Indexer(this.app.vault, this.todoTree, this.parser);

    // Subscribe to TodoTree changes
    this.todoTree.subscribe(this.tick.bind(this));
  }

  async onload(): Promise<void> {
    this.settings = Object.assign(DEFAULT_SETTINGS, (await this.loadData()) ?? {});
    this.dateFormatter = new DateFormatter(this.settings.dateFormat);
    this.addSettingTab(new SettingsTab(this.app, this));

    // 编辑模式（Source / Live Preview）：CodeMirror decoration 实时在 `#T[n]` 后追加日期
    this.registerEditorExtension(relativeDateEditorExtension(this.dateParser, this.dateFormatter));

    // 阅读模式：markdown postprocessor 在 `#T[n]` 标签后渲染解析出的真实日期（读 frontmatter 的 todo.date）
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (!ctx.sourcePath) return;
      const noteFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(noteFile instanceof TFile)) return;
      void this.app.vault.cachedRead(noteFile).then((content) => {
        const baseDate = this.dateParser.parseTodoDateProperty(content);
        if (!baseDate) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        const textNodes: Text[] = [];
        while ((node = walker.nextNode())) textNodes.push(node as Text);
        for (const textNode of textNodes) {
          const date = this.dateParser.parseRelativeDate(textNode.textContent ?? '', baseDate);
          if (!date) continue;
          const anchor = textNode.parentElement;
          if (anchor && anchor.classList.contains('tag')) {
            // A 方案：把日期并进标签块内，一个 tag 一体
            const text = anchor.textContent ?? '';
            anchor.textContent = `${text} (${this.dateFormatter.formatDate(date)})`;
          } else {
            const span = document.createElement('span');
            span.className = 'todo-item-relative-date';
            span.textContent = `(${this.dateFormatter.formatDate(date)})`;
            textNode.parentNode?.insertBefore(span, textNode.nextSibling);
          }
        }
      });
    });

    this.registerView(VIEW_TYPE_TODO, (leaf: WorkspaceLeaf) => {
      const todos: TodoItem[] = [];
      const props = {
        todos: todos,
        formatDate: (date: DateTime) => {
          return this.dateFormatter.formatDate(date);
        },
        openFile: (filePath: string) => {
          const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
          const leaves = this.app.workspace.getLeavesOfType('markdown');
          const existingLeaf = leaves.find((leaf) => leaf.view.getState().file === filePath);

          if (existingLeaf) {
            this.app.workspace.setActiveLeaf(existingLeaf, true, true);
            return;
          }

          if (this.settings.openFilesInNewLeaf && this.app.workspace.getActiveFile()) {
            this.app.workspace.getLeaf(true).openFile(file);
          } else {
            this.app.workspace.getUnpinnedLeaf().openFile(file);
          }
        },
        toggleTodo: async (todo: TodoItem, newStatus: TodoItemStatus) => {
          if (newStatus === TodoItemStatus.Done) {
            // Complete task
            const recordedItems = this.todoTree.completeTask(todo.taskId);

            // Collect all tasks to sync (parent + all children)
            const tasksToSync: TodoItem[] = [...recordedItems];
            tasksToSync.push(...this.collectAllChildren(todo.taskId));

            // Sync all tasks to file at once
            await this.syncTasksToFile(tasksToSync);

            // Track completed tasks for daily report
            for (const item of recordedItems) {
              await this.trackCompletedTaskRecord(item);
            }
          } else {
            // Uncomplete task - restore to Todo
            this.todoTree.uncompleteTask(todo.taskId);

            // Collect all tasks to sync (parent + all children)
            const tasksToSync: TodoItem[] = [];
            const updatedItem = this.todoTree.getItem(todo.taskId);
            if (updatedItem) {
              tasksToSync.push(updatedItem);
              tasksToSync.push(...this.collectAllChildren(todo.taskId));
            }

            // Sync all tasks to file at once
            await this.syncTasksToFile(tasksToSync);
          }
        },
        onGenerateDailySummary: async () => {
          await this.generateDailySummary();
        },
        enableDailyReport: this.settings.enableDailyReport,
        lookupChild: (childId: string) => this.todoTree.getItem(childId),
        getRootItems: () => this.todoTree.getRootItems(),
        getActionDate: (item: TodoItem) => this.todoTree.getActionDate(item),
      };
      this.view = new TodoItemView(leaf, props);
      return this.view;
    });

    this.app.workspace.onLayoutReady(async () => {
      await this.initLeaf();
      await this.triggerIndex();
    });
  }

  private isPathWhitelisted(path: string): boolean {
    const whitelist = this.settings.dailyReportWhitelist;
    if (!whitelist || whitelist.trim() === '') return true;
    const dirs = whitelist
      .split(/[,，\n]/)
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    return dirs.some((dir) => path.startsWith(dir));
  }

  private isPathExcluded(path: string): boolean {
    const excludedDirs = this.settings.excludedDirectories || '';
    if (excludedDirs.trim() === '') return false;
    const dirs = excludedDirs
      .split(/[,，]/)
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    return dirs.some((dir) => path.startsWith(dir));
  }

  private mapToCompletedTaskRecord(todo: TodoItem): CompletedTaskRecord {
    const task: CompletedTaskRecord = {
      taskId: todo.taskId,
      path: todo.sourceFilePath,
      content: todo.description,
      completedAt: new Date().toISOString(),
      subtasks: [],
    };
    if (todo.childIds && todo.childIds.length > 0) {
      task.subtasks = todo.childIds
        .map((childId) => this.todoTree.getItem(childId))
        .filter((child): child is TodoItem => child !== undefined)
        .map((child) => this.mapToCompletedTaskRecord(child));
    }
    return task;
  }

  /**
   * Sync a single task status back to source file
   */
  private buildNewLine(todo: TodoItem, content: string): string {
    // Find the line containing the task
    // startIndex points to the checkbox position (after - or *)
    const lineStart = content.lastIndexOf('\n', todo.startIndex - 1) + 1;
    const lineEnd = content.indexOf('\n', todo.startIndex);
    const actualLineEnd = lineEnd === -1 ? content.length : lineEnd;

    const originalLine = content.substring(lineStart, actualLineEnd);

    // Determine checkbox prefix (e.g., "- " or "* ")
    const checkboxPrefix = originalLine.match(/^(\s*[-*]\s)/)?.[1] || '';
    // Done and CascadedDone both show as completed
    const checkboxStatus = (todo.status === TodoItemStatus.Done || todo.status === TodoItemStatus.CascadedDone) ? 'x' : ' ';
    return `${checkboxPrefix}[${checkboxStatus}] ${todo.originalDescription}`;
  }

  /**
   * Sync tasks to file - reads file once, modifies all tasks, writes once
   */
  private async syncTasksToFile(todos: TodoItem[]): Promise<void> {
    if (todos.length === 0) return;

    // Group todos by file
    const todosByFile = new Map<string, { file: TFile; content: string; todos: TodoItem[] }>();
    for (const todo of todos) {
      const file = this.app.vault.getAbstractFileByPath(todo.sourceFilePath);
      if (!(file instanceof TFile)) continue;

      if (!todosByFile.has(todo.sourceFilePath)) {
        const content = await this.app.vault.read(file);
        todosByFile.set(todo.sourceFilePath, { file, content, todos: [] });
      }
      todosByFile.get(todo.sourceFilePath)!.todos.push(todo);
    }

    // Process each file
    for (const [, { file, content, todos: fileTodos }] of todosByFile) {
      let newContent = content;

      // Sort by startIndex descending to modify from end to start
      fileTodos.sort((a, b) => b.startIndex - a.startIndex);

      for (const todo of fileTodos) {
        const lineStart = newContent.lastIndexOf('\n', todo.startIndex - 1) + 1;
        const lineEnd = newContent.indexOf('\n', todo.startIndex);
        const actualLineEnd = lineEnd === -1 ? newContent.length : lineEnd;

        const originalLine = newContent.substring(lineStart, actualLineEnd);
        const checkboxPrefix = originalLine.match(/^(\s*[-*]\s)/)?.[1] || '';
        const checkboxStatus = (todo.status === TodoItemStatus.Done || todo.status === TodoItemStatus.CascadedDone) ? 'x' : ' ';
        const newLine = `${checkboxPrefix}[${checkboxStatus}] ${todo.originalDescription}`;

        newContent = newContent.substring(0, lineStart) + newLine + newContent.substring(actualLineEnd);
      }

      // Write to file
      await this.app.vault.modify(file, newContent);

      // Re-parse the modified file immediately to update the tree
      // This prevents Indexer's rebuild (which uses stale cache) from overwriting our changes
      const result = await this.parser.parseFile(file.path, newContent);
      // Update tree with new items for this file
      this.todoTree.rebuildForFile(file.path, result.items);
    }
  }

  /**
   * Collect all cascaded children recursively
   */
  private collectAllChildren(parentId: string): TodoItem[] {
    const parent = this.todoTree.getItem(parentId);
    if (!parent) return [];

    const allChildren: TodoItem[] = [];
    for (const childId of parent.childIds) {
      const child = this.todoTree.getItem(childId);
      if (child) {
        allChildren.push(child);
        allChildren.push(...this.collectAllChildren(childId));
      }
    }
    return allChildren;
  }

  async trackCompletedTaskRecord(todo: TodoItem): Promise<void> {
    if (!this.settings.enableDailyReport) return;
    if (!this.isPathWhitelisted(todo.sourceFilePath)) return;
    if (this.isPathExcluded(todo.sourceFilePath)) return;

    const today = DateTime.now().toFormat('yyyy-MM-dd');

    // Initialize dailyReportData if it doesn't exist
    if (!this.settings.dailyReportData) {
      this.settings.dailyReportData = {
        date: today,
        completedTasks: [],
      };
    }

    // Check if the date has changed
    if (this.settings.dailyReportData.date !== today) {
      // Flush yesterday's data if there are any completed tasks
      if (this.settings.dailyReportData.completedTasks.length > 0) {
        await this.flushDailyReport(this.settings.dailyReportData.date, this.settings.dailyReportData.completedTasks);
      }
      // Reset for today
      this.settings.dailyReportData = {
        date: today,
        completedTasks: [],
      };
    }

    // Add the new task
    this.settings.dailyReportData.completedTasks.push(this.mapToCompletedTaskRecord(todo));
    await this.saveData(this.settings);
  }

  async flushDailyReport(date: string, tasks: CompletedTaskRecord[]): Promise<void> {
    const reportPath = this.settings.dailyReportPath;
    if (!reportPath) return;

    if (!(await this.app.vault.adapter.exists(reportPath))) {
      await this.app.vault.createFolder(reportPath);
    }

    const filePath = `${reportPath}/${date}.md`;
    let file = this.app.vault.getAbstractFileByPath(filePath);

    if (!file) {
      file = await this.app.vault.create(filePath, '');
    }

    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      let newContent = content;

      const header = `### ${this.settings.dailyReportTodayHeader}\n`;
      if (!newContent.includes(header)) {
        const prefix = newContent ? '\n' : '';
        newContent += prefix + header;
      }

      newContent += this.formatTasksHierarchically(tasks);

      await this.app.vault.modify(file, newContent);
    }
  }

  private formatTasksHierarchically(tasks: (CompletedTaskRecord | string)[]): string {
    interface TaskNode {
      name: string;
      children: Map<string, TaskNode>;
      tasks: CompletedTaskRecord[];
    }

    const root: TaskNode = { name: 'root', children: new Map(), tasks: [] };
    const whitelist = this.settings.dailyReportWhitelist
      .split(/[,，\n]/)
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    tasks.forEach((task) => {
      let displayPath = '';
      let content = '';
      let subtasks: CompletedTaskRecord[] | undefined;

      if (typeof task === 'string') {
        // Handle legacy string format
        // Try to parse "Folder/Filename: Content" format if possible,
        // or just put it under "Unknown" or root.
        if (task.includes(': ')) {
          const splitIndex = task.indexOf(': ');
          displayPath = task.substring(0, splitIndex);
          content = task.substring(splitIndex + 2);
        } else {
          displayPath = 'Others';
          content = task;
        }
      } else {
        if (!task.path) {
          // Fallback if path is missing in object
          displayPath = 'Others';
          content = task.content || JSON.stringify(task);
        } else {
          displayPath = task.path.replace(/\.md$/, '');
          content = task.content;
          subtasks = task.subtasks;
        }
      }

      // Remove whitelist prefix if present
      for (const prefix of whitelist) {
        if (displayPath.startsWith(prefix)) {
          // Check if it's an exact match or followed by a slash
          // to avoid partial matches like "folder123" matching "folder1"
          if (displayPath.length === prefix.length || displayPath.charAt(prefix.length) === '/') {
            displayPath = displayPath.substring(prefix.length);
            // Remove leading slash if present
            if (displayPath.startsWith('/')) {
              displayPath = displayPath.substring(1);
            }
            break; // Apply only the first matching whitelist prefix
          }
        }
      }

      const parts = displayPath.split('/');
      let currentNode = root;

      parts.forEach((part) => {
        if (!currentNode.children.has(part)) {
          currentNode.children.set(part, { name: part, children: new Map(), tasks: [] });
        }
        currentNode = currentNode.children.get(part)!;
      });

      currentNode.tasks.push({ taskId: '', path: displayPath, content, completedAt: '', subtasks: subtasks || [] });
    });

    const renderTaskRecursive = (task: CompletedTaskRecord, prefix: string): string => {
      let res = `${prefix}- ${task.content}\n`;
      if (task.subtasks) {
        task.subtasks.forEach((sub) => {
          res += renderTaskRecursive(sub, prefix + '    ');
        });
      }
      return res;
    };

    const renderTree = (node: TaskNode, level: number): string => {
      let output = '';
      const indent = '    '.repeat(level);

      // Render children folders
      const sortedKeys = Array.from(node.children.keys()).sort();
      for (const key of sortedKeys) {
        const child = node.children.get(key)!;
        output += `${indent}- ${child.name}\n`;
        output += renderTree(child, level + 1);
      }

      // Render tasks in this folder
      node.tasks.forEach((t) => {
        output += renderTaskRecursive(t, indent);
      });

      return output;
    };

    return renderTree(root, 0);
  }

  async generateDailySummary(): Promise<void> {
    const reportPath = this.settings.dailyReportPath;
    if (!reportPath) {
      new Notice(t('DAILY_REPORT_PATH_NOT_SET'));
      return;
    }

    if (!(await this.app.vault.adapter.exists(reportPath))) {
      await this.app.vault.createFolder(reportPath);
    }

    const today = DateTime.now().toFormat('yyyy-MM-dd');
    const filePath = `${reportPath}/${today}.md`;
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      file = await this.app.vault.create(filePath, '');
    }

    if (!(file instanceof TFile)) return;

    // Use data from settings for completed tasks
    const completedTasks = this.settings.dailyReportData?.completedTasks || [];

    // Scan for next tasks using the in-memory TodoTree
    const nextTasks: CompletedTaskRecord[] = [];
    const now = DateTime.now();
    const oneWeekLater = now.plus({ days: 7 });

    // Get all items from the tree
    const allItems = this.todoTree.getAllItems();

    for (const item of allItems) {
      // Only Todo status (not Done, not CascadedDone), and not someday/maybe
      if (item.status !== TodoItemStatus.Todo || item.isSomedayMaybeNote) {
        continue;
      }

      // Skip if not whitelisted or excluded
      if (!this.isPathWhitelisted(item.sourceFilePath)) continue;
      if (this.isPathExcluded(item.sourceFilePath)) continue;

      // If parent is also Todo, skip (it will be included with parent)
      if (item.parentId) {
        const parent = this.todoTree.getItem(item.parentId);
        if (parent && parent.status === TodoItemStatus.Todo && !parent.isSomedayMaybeNote) {
          continue;
        }
      }

      // Check if this task is scheduled within the next week
      const actionDate = this.todoTree.getActionDate(item);
      if (actionDate && actionDate <= oneWeekLater && actionDate > now) {
        nextTasks.push(this.mapToCompletedTaskRecord(item));
      }
    }

    let summaryContent = '';

    if (completedTasks.length > 0) {
      summaryContent += `### ${this.settings.dailyReportTodayHeader}\n`;
      summaryContent += this.formatTasksHierarchically(completedTasks);
      summaryContent += '\n';
    }

    if (nextTasks.length > 0) {
      summaryContent += `### ${this.settings.dailyReportNextHeader}\n`;
      summaryContent += this.formatTasksHierarchically(nextTasks);
      summaryContent += '\n';
    }

    if (summaryContent === '') {
      new Notice(t('NO_TASKS_FOUND'));
      return;
    }

    await this.app.vault.modify(file, summaryContent);
    new Notice(t('DAILY_SUMMARY_GENERATED'));

    // Open the file in a new leaf or existing leaf
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    const existingLeaf = leaves.find((leaf) => leaf.view.getState().file === file.path);

    if (existingLeaf) {
      this.app.workspace.setActiveLeaf(existingLeaf, true, true);
      return;
    }

    if (this.settings.openFilesInNewLeaf && this.app.workspace.getActiveFile()) {
      await this.app.workspace.getLeaf(true).openFile(file);
    } else {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  onunload(): void {
    this.indexer.unregister();
    this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO).forEach((leaf) => leaf.detach());
  }

  async initLeaf(): Promise<void> {
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_TODO).length) {
      return;
    }
    await this.app.workspace.getRightLeaf(false).setViewState({
      type: VIEW_TYPE_TODO,
    });
  }

  getSettings(): TodoPluginSettings {
    return this.settings;
  }

  async updateSettings(settings: TodoPluginSettings): Promise<void> {
    this.settings = settings;
    this.dateFormatter = new DateFormatter(this.settings.dateFormat);
    await this.saveData(this.settings);
    this.todoTree.setSettings(settings);

    // Update view props if view exists
    if (this.view) {
      this.view.setProps((currentProps) => ({
        ...currentProps,
        enableDailyReport: this.settings.enableDailyReport,
      }));
    }
  }

  private async triggerIndex(): Promise<void> {
    // Scan all markdown files and build the tree
    const files = this.app.vault.getMarkdownFiles();
    const allItems: TodoItem[] = [];

    for (const f of files) {
      if (this.isPathExcluded(f.path)) continue;

      const content = await this.app.vault.cachedRead(f);
      const result = await this.parser.parseFile(f.path, content);
      allItems.push(...result.items);
    }

    this.todoTree.rebuild(allItems);
    this.indexer.register();
  }

  tick(todos: TodoItem[]): void {
    if (!this.view) {
      return;
    }
    this.view.setProps((currentProps: TodoItemViewProps) => {
      return {
        ...currentProps,
        todos: todos,
      };
    });
  }
}
