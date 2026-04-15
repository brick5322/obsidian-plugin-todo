import { DailyReportManager } from './DailyReportManager';
import { TodoItem, TodoItemStatus } from './TodoItem';
import { TodoPluginSettings, DEFAULT_SETTINGS } from './TodoPluginSettings';

describe('DailyReportManager', () => {
  let manager: DailyReportManager;
  let settings: TodoPluginSettings;

  beforeEach(() => {
    settings = {
      ...DEFAULT_SETTINGS,
      enableDailyReport: true,
      dailyReportPath: 'Daily Reports',
      dailyReportWhitelist: '',
      dailyReportData: {
        date: new Date().toISOString().split('T')[0],
        completedTasks: [],
      },
    };
    manager = new DailyReportManager(settings);
  });

  test('should record completed task', () => {
    const task = new TodoItem({
      taskId: 'task1',
      sourceFilePath: 'test.md',
      startIndex: 0,
      length: 10,
      status: TodoItemStatus.Todo,  // Note: Todo status means "ready to record"
      description: 'Test task',
      originalDescription: 'Test task #2024-01-15',
      isSomedayMaybeNote: false,
      childIds: [],
    });

    manager.recordCompletion(task);

    const data = manager.getCompletedTasks();
    expect(data.length).toBe(1);
    expect(data[0].taskId).toBe('task1');
    expect(data[0].content).toBe('Test task');
  });

  test('should deduplicate by taskId', () => {
    const task = new TodoItem({
      taskId: 'same-id',
      sourceFilePath: 'test.md',
      startIndex: 0,
      length: 10,
      status: TodoItemStatus.Todo,
      description: 'Same task',
      originalDescription: 'Same task',
      isSomedayMaybeNote: false,
      childIds: [],
    });

    manager.recordCompletion(task);
    manager.recordCompletion(task); // duplicate

    const data = manager.getCompletedTasks();
    expect(data.length).toBe(1);
  });

  test('should not record CascadedDone task', () => {
    const task = new TodoItem({
      taskId: 'cascaded-task',
      sourceFilePath: 'test.md',
      startIndex: 0,
      length: 10,
      status: TodoItemStatus.CascadedDone,
      description: 'Cascaded task',
      originalDescription: 'Cascaded task',
      isSomedayMaybeNote: false,
      childIds: [],
    });

    manager.recordCompletion(task);

    const data = manager.getCompletedTasks();
    expect(data.length).toBe(0);
  });

  test('should record with ISO timestamp', () => {
    const task = new TodoItem({
      taskId: 'task1',
      sourceFilePath: 'test.md',
      startIndex: 0,
      length: 10,
      status: TodoItemStatus.Todo,
      description: 'Test task',
      originalDescription: 'Test task',
      isSomedayMaybeNote: false,
      childIds: [],
    });

    manager.recordCompletion(task);

    const data = manager.getCompletedTasks();
    expect(data[0].completedAt).toBeDefined();
    expect(data[0].completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
