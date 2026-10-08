import { DateTime } from 'luxon';
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
    // Stack to track parent context: [{indent, originalDescription}]
    const stack: { indent: number; originalDescription: string }[] = [];

    // 基准日 T：来自笔记 frontmatter 的 todo.date 属性
    const baseDate = this.dateParser.parseTodoDateProperty(fileContents);

    for (const entry of matches) {
      const item = this.parseTask(filePath, entry, fileContents, stack, baseDate);
      items.push(item);

      // Update stack for next iteration
      // Pop until we find a smaller indent (sibling or parent)
      while (stack.length > 0 && stack[stack.length - 1].indent >= item.indentation) {
        stack.pop();
      }
      // Push current item as potential parent
      stack.push({ indent: item.indentation, originalDescription: item.originalDescription });
    }

    return { items };
  }

  private parseTask(
    filePath: string,
    entry: RegExpMatchArray,
    fileContents: string,
    stack: { indent: number; originalDescription: string }[],
    baseDate?: DateTime
  ): TodoItem {
    const todoItemOffset = 2; // Strip off `-|* `
    const status = entry[2] === 'x' ? TodoItemStatus.Done : TodoItemStatus.Todo;
    const originalDescription = entry[3].trim();

    // Parse date and someday from originalDescription
    const descriptionWithoutDate = this.dateParser.removeDate(originalDescription);

    const somedayPattern = /#(someday)/gi;
    const isSomedayMaybeTask = somedayPattern.test(originalDescription);
    const description = descriptionWithoutDate.replace(somedayPattern, '').trim();

    // 解析 #T[n] 相对日期标签。标签本身保留在 description 中（仍是合法 Obsidian 标签），
    // 仅把算出的真实日期存进 date 字段。
    const date = this.dateParser.parseRelativeDate(originalDescription, baseDate);

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

    // Find parent originalDescription from stack
    // Parent is the top of stack with smaller indent
    let parentDescription = '';
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].indent < indentation) {
        parentDescription = stack[i].originalDescription;
        break;
      }
    }

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
      date,
    });
  }

  private generateHash(input: string): string {
    // Use a simple non-cryptographic hash for browser compatibility
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const unsignedHash = hash >>> 0;
    return unsignedHash.toString(16).padStart(8, '0');
  }
}
