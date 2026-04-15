import { TodoItem, TodoItemStatus } from './TodoItem';
import { DateParser } from '../util/DateParser';
import { extractDueDateFromDailyNotesFile } from '../util/DailyNoteParser';
import { DateTime } from 'luxon';
import * as crypto from 'crypto';

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

    for (const entry of matches) {
      const item = this.parseTask(filePath, entry, fileContents);
      items.push(item);
    }

    return { items };
  }

  private parseTask(filePath: string, entry: RegExpMatchArray, fileContents: string): TodoItem {
    const todoItemOffset = 2; // Strip off `-|* `
    const status = entry[2] === 'x' ? TodoItemStatus.Done : TodoItemStatus.Todo;
    const originalDescription = entry[3].trim();

    // Parse date and someday from originalDescription
    const parsedDate = this.dateParser.parseDate(originalDescription);
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

    // Calculate indentation for hash
    const prefix = fileContents.substring(lineStart, matchIndex);
    const normalizedPrefix = prefix.replace(/\t/g, '    ');
    const indentation = normalizedPrefix.length;

    // Generate taskId from content hash
    const hashInput = `${filePath}|${originalDescription}|${indentation}`;
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
      childIds: [],
    });
  }

  private generateHash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }
}
