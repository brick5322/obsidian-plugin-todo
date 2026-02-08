import { App, Plugin, PluginManifest, TFile, WorkspaceLeaf, Notice } from 'obsidian';
import { VIEW_TYPE_TODO } from './constants';
import { TodoItemView, TodoItemViewProps } from './ui/TodoItemView';
import { TodoItem, TodoItemStatus } from './model/TodoItem';
import { TodoIndex } from './model/TodoIndex';
import { TodoPluginSettings, DEFAULT_SETTINGS } from './model/TodoPluginSettings';
import { SettingsTab } from './ui/SettingsTab';
import { DateFormatter } from 'util/DateFormatter';
import { DateTime } from 'luxon';
import { TodoParser } from './model/TodoParser';
import { DateParser } from './util/DateParser';

export default class TodoPlugin extends Plugin {
  private dateFormatter: DateFormatter;
  private todoIndex: TodoIndex;
  private view: TodoItemView;
  private settings: TodoPluginSettings;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.todoIndex = new TodoIndex(this.app.vault, DEFAULT_SETTINGS, this.tick.bind(this));
  }

  async onload(): Promise<void> {
    this.settings = Object.assign(DEFAULT_SETTINGS, (await this.loadData()) ?? {});
    this.dateFormatter = new DateFormatter(this.settings.dateFormat);
    this.addSettingTab(new SettingsTab(this.app, this));

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
          this.todoIndex.setStatus(todo, newStatus);
          if (newStatus === TodoItemStatus.Done) {
            await this.trackCompletedTask(todo);
          }
        },
        onGenerateDailySummary: async () => {
          await this.generateDailySummary();
        },
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

  async trackCompletedTask(todo: TodoItem): Promise<void> {
    if (!this.settings.enableDailyReport) return;
    if (!this.isPathWhitelisted(todo.sourceFilePath)) return;

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
    this.settings.dailyReportData.completedTasks.push({
      path: todo.sourceFilePath,
      content: todo.description,
    });
    await this.saveData(this.settings);
  }

  async flushDailyReport(date: string, tasks: { path: string; content: string }[]): Promise<void> {
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

  private formatTasksHierarchically(tasks: ({ path: string; content: string } | string)[]): string {
    interface TaskNode {
      name: string;
      children: Map<string, TaskNode>;
      tasks: string[];
    }

    const root: TaskNode = { name: 'root', children: new Map(), tasks: [] };
    const whitelist = this.settings.dailyReportWhitelist
      .split(/[,，\n]/)
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    tasks.forEach((task) => {
      let displayPath = '';
      let content = '';

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
        }
      }

      // Remove whitelist prefix if present
      for (const prefix of whitelist) {
        if (displayPath.startsWith(prefix)) {
          displayPath = displayPath.substring(prefix.length);
          // Remove leading slash if present
          if (displayPath.startsWith('/')) {
            displayPath = displayPath.substring(1);
          }
          break; // Apply only the first matching whitelist prefix
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

      currentNode.tasks.push(content);
    });

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
        output += `${indent}- ${t}\n`;
      });

      return output;
    };

    return renderTree(root, 0);
  }

  async generateDailySummary(): Promise<void> {
    const reportPath = this.settings.dailyReportPath;
    if (!reportPath) {
      new Notice('Daily report path is not set.');
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

    // Scan for next tasks
    const dateParser = new DateParser(this.settings.dateTagFormat, this.settings.dateFormat);
    const todoParser = new TodoParser(dateParser);
    const files = this.app.vault.getMarkdownFiles();
    const oneWeekAgo = DateTime.now().minus({ days: 7 }).toMillis();
    const nextTasks: { path: string; content: string }[] = [];

    for (const f of files) {
      if (f.stat.mtime < oneWeekAgo) continue;
      if (!this.isPathWhitelisted(f.path)) continue;

      const content = await this.app.vault.cachedRead(f);
      const tasks = await todoParser.parseTasks(f.path, content);

      tasks.forEach((t) => {
        if (t.status === TodoItemStatus.Todo) {
          nextTasks.push({
            path: f.path,
            content: t.description,
          });
        }
      });
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
      new Notice('No tasks found to summarize.');
      return;
    }

    await this.app.vault.modify(file, summaryContent);
    new Notice('Daily summary generated.');
  }

  onunload(): void {
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
    this.todoIndex.setSettings(settings);
  }

  private async triggerIndex(): Promise<void> {
    await this.todoIndex.initialize();
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
