import { TodoItem, TodoItemStatus } from './TodoItem';
import { DateTime } from 'luxon';

describe('TodoItem', () => {
  test('should create with required fields', () => {
    const item = new TodoItem({
      taskId: 'abc123',
      sourceFilePath: 'test.md',
      startIndex: 2,
      length: 10,
      status: TodoItemStatus.Todo,
      description: 'Test task',
      originalDescription: 'Test task #2024-01-01',
      isSomedayMaybeNote: false,
      childIds: [],
    });

    expect(item.taskId).toBe('abc123');
    expect(item.status).toBe(TodoItemStatus.Todo);
    expect(item.parentId).toBeUndefined();
    expect(item.childIds).toEqual([]);
  });

  test('should support parent/child relationship via IDs', () => {
    const parent = new TodoItem({
      taskId: 'parent1',
      sourceFilePath: 'test.md',
      startIndex: 2,
      length: 10,
      status: TodoItemStatus.Todo,
      description: 'Parent',
      originalDescription: 'Parent',
      isSomedayMaybeNote: false,
      childIds: ['child1'],
    });

    const child = new TodoItem({
      taskId: 'child1',
      sourceFilePath: 'test.md',
      startIndex: 6,
      length: 10,
      status: TodoItemStatus.Todo,
      description: 'Child',
      originalDescription: 'Child',
      isSomedayMaybeNote: false,
      parentId: 'parent1',
      childIds: [],
    });

    expect(parent.childIds).toContain('child1');
    expect(child.parentId).toBe('parent1');
  });

  test('TodoItemStatus should have CascadedDone', () => {
    expect(TodoItemStatus.CascadedDone).toBe(2);
    expect(TodoItemStatus.Todo).toBe(0);
    expect(TodoItemStatus.Done).toBe(1);
  });
});
