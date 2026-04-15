import { Parser, ParseResult } from './Parser';
import { DateParser } from '../util/DateParser';
import { DateTime } from 'luxon';
import { TodoItemStatus } from './TodoItem';

// Mock DailyNoteParser
jest.mock('../util/DailyNoteParser', () => ({
  extractDueDateFromDailyNotesFile: jest.fn().mockReturnValue(undefined),
}));

const dateParser = new DateParser(`#${DateParser.DateToken}`, 'yyyy-MM-dd');
const parser = new Parser(dateParser);

describe('Parser', () => {
  test('should parse a single todo', async () => {
    const content = `- [ ] Buy milk #2024-01-15`;
    const result = await parser.parseFile('test.md', content);

    expect(result.items.length).toBe(1);
    const item = result.items[0];
    expect(item.description).toBe('Buy milk');
    expect(item.originalDescription).toBe('Buy milk #2024-01-15');
    expect(item.status).toBe(TodoItemStatus.Todo);
    expect(item.isSomedayMaybeNote).toBe(false);
    expect(item.taskId).toBeDefined();
    expect(item.taskId.length).toBeGreaterThan(0);
  });

  test('should generate stable taskId based on content hash', async () => {
    const content = `- [ ] Buy milk`;
    const result1 = await parser.parseFile('test.md', content);
    const result2 = await parser.parseFile('test.md', content);

    expect(result1.items[0].taskId).toBe(result2.items[0].taskId);
  });

  test('should parse completed todo', async () => {
    const content = `- [x] Done task`;
    const result = await parser.parseFile('test.md', content);

    expect(result.items.length).toBe(1);
    expect(result.items[0].status).toBe(TodoItemStatus.Done);
  });

  test('should parse someday maybe task', async () => {
    const content = `- [ ] Read book #someday`;
    const result = await parser.parseFile('test.md', content);

    expect(result.items.length).toBe(1);
    expect(result.items[0].isSomedayMaybeNote).toBe(true);
    expect(result.items[0].description).toBe('Read book');
  });

  test('should handle asterisk syntax', async () => {
    const content = `* [ ] Task with asterisk`;
    const result = await parser.parseFile('test.md', content);

    expect(result.items.length).toBe(1);
  });

  test('should return flat list (no parent/child)', async () => {
    const content = `- [ ] Parent
  - [ ] Child`;
    const result = await parser.parseFile('test.md', content);

    // Parser returns flat list, tree building is TodoTree's job
    expect(result.items.length).toBe(2);
    expect(result.items[0].parentId).toBeUndefined();
    expect(result.items[1].parentId).toBeUndefined();
  });

  test('should calculate correct startIndex and length', async () => {
    const content = `Some text before
- [ ] My task`;
    const result = await parser.parseFile('test.md', content);

    const task = result.items[0];
    expect(task.startIndex).toBeGreaterThan(0);
    // length should be from '-' to end of line
    expect(task.length).toBeGreaterThan(0);
  });
});
