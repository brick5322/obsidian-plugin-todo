import { TodoItem, TodoItemStatus } from './TodoItem';
import { DateParser } from '../util/DateParser';

export interface ParseResult {
  items: TodoItem[];
}

export class Parser {
  private dateParser: DateParser;

  constructor(dateParser: DateParser) {
    this.dateParser = dateParser;
  }

  async parseFile(filePath: string, fileContents: string): Promise<ParseResult> {
    const pattern = /(-|\*) \[(\s|x)?\]\s(.*)/g;
    const matches = [...fileContents.matchAll(pattern)];

    const items: TodoItem[] = [];
    const stack: string[] = [];

    for (const entry of matches) {
      const item = this.parseTask(filePath, entry, fileContents, stack);
      items.push(item);

      const level = item.indentation / 2;
      if (Number.isInteger(level) && level >= 0) {
        stack.length = level;
        stack[level] = item.originalDescription;
      } else {
        stack.length = 0;
      }
    }

    return { items };
  }

  private parseTask(filePath: string, entry: RegExpMatchArray, fileContents: string, stack: string[]): TodoItem {
    const todoItemOffset = 2; // Strip off `-|* `
    const status = entry[2] === 'x' ? TodoItemStatus.Done : TodoItemStatus.Todo;
    const originalDescription = entry[3].trim();

    // Parse date and someday from originalDescription
    const descriptionWithoutDate = this.dateParser.removeDate(originalDescription);

    const somedayPattern = /#(someday)/gi;
    const isSomedayMaybeTask = somedayPattern.test(originalDescription);
    const description = descriptionWithoutDate.replace(somedayPattern, '').trim();

    // Calculate startIndex and length
    const matchIndex = entry.index ?? 0;
    const startIndex = matchIndex + todoItemOffset;
    const lineStart = fileContents.lastIndexOf('\n', matchIndex - 1) + 1;
    const lineEnd = fileContents.indexOf('\n', matchIndex);
    const actualLineEnd = lineEnd === -1 ? fileContents.length : lineEnd;
    const length = actualLineEnd - (matchIndex + todoItemOffset);

    // Calculate indentation
    const prefix = fileContents.substring(lineStart, matchIndex);
    const normalizedPrefix = prefix.replace(/\t/g, '    ');
    const indentation = normalizedPrefix.length;

    const level = indentation / 2;
    const parentDescription = Number.isInteger(level) && level > 0 ? stack[level - 1] ?? '' : '';

    // Generate taskId including parent content to differentiate same tasks under different parents
    const hashInput = `${filePath}|${parentDescription}|${indentation}|${originalDescription}`;
    const taskId = this.generateHash(hashInput);

    return new TodoItem({
      taskId,
      sourceFilePath: filePath,
      startIndex,
      length,
      status,
      description,
      originalDescription,
      isSomedayMaybeNote: isSomedayMaybeTask,
      indentation,
      childIds: [],
    });
  }

  private generateHash(input: string): string {
    // Use a simple non-cryptographic hash for browser compatibility
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    const unsignedHash = hash >>> 0;
    return unsignedHash.toString(16).padStart(8, '0');
  }
}
