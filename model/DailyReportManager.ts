import { TodoItem, TodoItemStatus } from './TodoItem';
import { CompletedTaskRecord, TodoPluginSettings } from './TodoPluginSettings';

/**
 * DailyReportManager - Manages daily report completed task records
 *
 * Deduplication: Uses taskId (content hash) to deduplicate
 * Only records direct completion (Todo status), not CascadedDone
 */
export class DailyReportManager {
  private settings: TodoPluginSettings;
  private recordedTaskIds: Set<string> = new Set();

  constructor(settings: TodoPluginSettings) {
    this.settings = settings;
  }

  /**
   * Record a completed task
   * Only records if:
   * - task.status is Todo (not Done or CascadedDone)
   * - taskId has not been recorded before (deduplication)
   */
  recordCompletion(task: TodoItem): void {
    // Only record Todo status (direct completion)
    if (task.status !== TodoItemStatus.Todo) {
      return;
    }

    // Deduplicate by taskId
    if (this.recordedTaskIds.has(task.taskId)) {
      return;
    }

    this.recordedTaskIds.add(task.taskId);

    const record: CompletedTaskRecord = {
      taskId: task.taskId,
      path: task.sourceFilePath,
      content: task.description,
      completedAt: new Date().toISOString(),
      subtasks: [],
    };

    // Initialize dailyReportData if needed
    if (!this.settings.dailyReportData) {
      this.settings.dailyReportData = {
        date: new Date().toISOString().split('T')[0],
        completedTasks: [],
      };
    }

    this.settings.dailyReportData.completedTasks.push(record);
  }

  /**
   * Get all completed task records
   */
  getCompletedTasks(): CompletedTaskRecord[] {
    return this.settings.dailyReportData?.completedTasks || [];
  }

  /**
   * Clear completed tasks for a specific date
   */
  clearForDate(date: string): void {
    if (this.settings.dailyReportData?.date === date) {
      this.settings.dailyReportData.completedTasks = [];
    }
    this.recordedTaskIds.clear();
  }

  /**
   * Check if a task has already been recorded
   */
  hasRecorded(taskId: string): boolean {
    return this.recordedTaskIds.has(taskId);
  }

  /**
   * Sync recordedTaskIds with existing completedTasks
   * Call this when loading settings with existing data
   */
  syncRecordedIds(): void {
    const tasks = this.getCompletedTasks();
    for (const task of tasks) {
      this.recordedTaskIds.add(task.taskId);
    }
  }
}
