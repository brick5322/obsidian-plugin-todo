import { DateTime } from 'luxon';
import { TodoItem, TodoItemStatus } from './TodoItem';
import { TodoTree } from './TodoTree';
import { DEFAULT_SETTINGS } from './TodoPluginSettings';

jest.mock('../util/DailyNoteParser');

describe('TodoTree', () => {
  let tree: TodoTree;

  beforeEach(() => {
    tree = new TodoTree(DEFAULT_SETTINGS);
  });

  describe('rebuild', () => {
    test('should build tree from items with proper parent-child relationships', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Root task',
          originalDescription: 'Root task',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
        new TodoItem({
          taskId: 'file.md:10',
          sourceFilePath: 'file.md',
          startIndex: 10,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Child task',
          originalDescription: 'Child task',
          isSomedayMaybeNote: false,
          indentation: 2,
          childIds: [],
        }),
      ];

      tree.rebuild(items);

      const rootItems = tree.getRootItems();
      expect(rootItems).toHaveLength(1);
      expect(rootItems[0].taskId).toBe('file.md:0');

      const child = tree.getItem('file.md:10');
      expect(child).toBeDefined();
      expect(child!.parentId).toBe('file.md:0');
      expect(rootItems[0].childIds).toContain('file.md:10');
    });

    test('should handle multiple root items', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Root 1',
          originalDescription: 'Root 1',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
        new TodoItem({
          taskId: 'file.md:20',
          sourceFilePath: 'file.md',
          startIndex: 20,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Root 2',
          originalDescription: 'Root 2',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);

      const rootItems = tree.getRootItems();
      expect(rootItems).toHaveLength(2);
    });

    test('should handle nested children', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Root',
          originalDescription: 'Root',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
        new TodoItem({
          taskId: 'file.md:10',
          sourceFilePath: 'file.md',
          startIndex: 10,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Child 1',
          originalDescription: 'Child 1',
          isSomedayMaybeNote: false,
          indentation: 2,
          childIds: [],
        }),
        new TodoItem({
          taskId: 'file.md:20',
          sourceFilePath: 'file.md',
          startIndex: 20,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Grandchild',
          originalDescription: 'Grandchild',
          isSomedayMaybeNote: false,
          indentation: 4,
          childIds: [],
        }),
      ];

      tree.rebuild(items);

      const child = tree.getItem('file.md:10');
      expect(child!.parentId).toBe('file.md:0');
      expect(child!.childIds).toContain('file.md:20');

      const grandchild = tree.getItem('file.md:20');
      expect(grandchild!.parentId).toBe('file.md:10');
    });

    test('should require a task at the immediately preceding two-space level', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Root',
          originalDescription: 'Root',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
        new TodoItem({
          taskId: 'file.md:10',
          sourceFilePath: 'file.md',
          startIndex: 10,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Skipped level',
          originalDescription: 'Skipped level',
          isSomedayMaybeNote: false,
          indentation: 4,
          childIds: [],
        }),
      ];

      tree.rebuild(items);

      expect(tree.getRootItems()).toHaveLength(2);
      expect(tree.getItem('file.md:10')!.parentId).toBeUndefined();
    });
  });

  describe('completeTask', () => {
    test('should only record direct completion', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Task',
          originalDescription: 'Task',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      const recorded = tree.completeTask('file.md:0');

      expect(recorded).toHaveLength(1);
      expect(recorded[0].taskId).toBe('file.md:0');
      expect(recorded[0].status).toBe(TodoItemStatus.Done);

      const task = tree.getItem('file.md:0');
      expect(task!.status).toBe(TodoItemStatus.Done);
    });

    test('should cascade to children but not record them', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Parent',
          originalDescription: 'Parent',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: ['file.md:10'],
        }),
        new TodoItem({
          taskId: 'file.md:10',
          sourceFilePath: 'file.md',
          startIndex: 10,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Child',
          originalDescription: 'Child',
          isSomedayMaybeNote: false,
          indentation: 2,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      const recorded = tree.completeTask('file.md:0');

      // Only parent should be recorded, not children
      expect(recorded).toHaveLength(1);
      expect(recorded[0].taskId).toBe('file.md:0');

      // Parent should be Done, child should be CascadedDone
      const parent = tree.getItem('file.md:0');
      expect(parent!.status).toBe(TodoItemStatus.Done);

      const child = tree.getItem('file.md:10');
      expect(child!.status).toBe(TodoItemStatus.CascadedDone);
    });

    test('should not record already completed task', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Done,
          description: 'Task',
          originalDescription: 'Task',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      const recorded = tree.completeTask('file.md:0');

      expect(recorded).toHaveLength(0);
    });
  });

  describe('getActionDate', () => {
    test('should return undefined when no date available', () => {
      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Task',
          originalDescription: 'Task',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      const task = tree.getItem('file.md:0')!;
      const actionDate = tree.getActionDate(task);

      expect(actionDate).toBeUndefined();
    });

    test('should return date when item has one in originalDescription', () => {
      const expectedDate = DateTime.fromFormat('2024-01-15', 'yyyy-MM-dd');

      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Task',
          originalDescription: 'Task #2024-01-15',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      const task = tree.getItem('file.md:0')!;
      const actionDate = tree.getActionDate(task);

      expect(actionDate).toEqual(expectedDate);
    });

    test('should inherit date from parent', () => {
      const parentDate = DateTime.fromFormat('2024-01-15', 'yyyy-MM-dd');

      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Parent',
          originalDescription: 'Parent #2024-01-15',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: ['file.md:10'],
        }),
        new TodoItem({
          taskId: 'file.md:10',
          sourceFilePath: 'file.md',
          startIndex: 10,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Child',
          originalDescription: 'Child',
          isSomedayMaybeNote: false,
          indentation: 2,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      const child = tree.getItem('file.md:10')!;
      const actionDate = tree.getActionDate(child);

      expect(actionDate).toEqual(parentDate);
    });

    test('should use min of self date and parent date', () => {
      const parentDate = DateTime.fromFormat('2024-01-20', 'yyyy-MM-dd');
      const childDate = DateTime.fromFormat('2024-01-15', 'yyyy-MM-dd');

      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Parent',
          originalDescription: 'Parent #2024-01-20',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: ['file.md:10'],
        }),
        new TodoItem({
          taskId: 'file.md:10',
          sourceFilePath: 'file.md',
          startIndex: 10,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Child',
          originalDescription: 'Child #2024-01-15',
          isSomedayMaybeNote: false,
          indentation: 2,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      const child = tree.getItem('file.md:10')!;
      const actionDate = tree.getActionDate(child);

      // Should use earlier date (child's date)
      expect(actionDate).toEqual(childDate);
    });
  });

  describe('subscribe', () => {
    test('should call listener when rebuild is called', () => {
      const listener = jest.fn();
      tree.subscribe(listener);

      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Task',
          originalDescription: 'Task',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      expect(listener).toHaveBeenCalledWith(items);
    });

    test('should call listener when completeTask is called', () => {
      const listener = jest.fn();
      tree.subscribe(listener);

      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Task',
          originalDescription: 'Task',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      listener.mockClear();
      tree.completeTask('file.md:0');
      expect(listener).toHaveBeenCalled();
    });

    test('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = tree.subscribe(listener);

      const items: TodoItem[] = [
        new TodoItem({
          taskId: 'file.md:0',
          sourceFilePath: 'file.md',
          startIndex: 0,
          length: 10,
          status: TodoItemStatus.Todo,
          description: 'Task',
          originalDescription: 'Task',
          isSomedayMaybeNote: false,
          indentation: 0,
          childIds: [],
        }),
      ];

      tree.rebuild(items);
      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      unsubscribe();
      tree.rebuild(items);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});