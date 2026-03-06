import { DateParser } from '../util/DateParser';
import { TodoItem, TodoItemStatus } from '../model/TodoItem';
import { DateTime } from 'luxon';
import { extractDueDateFromDailyNotesFile } from '../util/DailyNoteParser';

export class TodoParser {
  private dateParser: DateParser;

  constructor(dateParser: DateParser) {
    this.dateParser = dateParser;
  }

  async parseTasks(filePath: string, fileContents: string): Promise<TodoItem[]> {
    const pattern = /(-|\*) \[(\s|x)?\]\s(.*)/g;
    const matches = [...fileContents.matchAll(pattern)];
    const fileDate = extractDueDateFromDailyNotesFile(filePath);

    const parentStack: { item: TodoItem; indentLength: number }[] = [];
    const allItems: TodoItem[] = [];

    for (const entry of matches) {
      // 1. Calculate indentation length
      const lineStart = fileContents.lastIndexOf('\n', entry.index! - 1) + 1;
      const prefix = fileContents.substring(lineStart, entry.index!);
      // Normalize tabs to 4 spaces to handle mixed indentation
      const normalizedPrefix = prefix.replace(/\t/g, '    ');
      const currentIndentLength = normalizedPrefix.length;

      // 2. Parse basic item
      const item = this.parseTask(filePath, entry);

      // 3. Determine Parent
      // Pop from stack until we find a parent with strictly less indentation
      while (
        parentStack.length > 0 &&
        currentIndentLength <= parentStack[parentStack.length - 1].indentLength
      ) {
        parentStack.pop();
      }

      const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1].item : undefined;

      if (parent) {
        item.parent = parent;
        parent.children.push(item);
        item.indentation = parent.indentation + 1;
      } else {
        item.indentation = 0;
      }

      // 4. Calculate Effective Date
      // Inheritance logic:
      // - Base: Parent's effective date OR File date (if root)
      // - Override: If item has originalDate, use min(originalDate, Base).
      // - If item has NO originalDate, use Base.

      const inheritedDate = parent ? parent.actionDate : fileDate;
      const originalDate = item.originalDate;

      let effectiveDate: DateTime | undefined;

      if (originalDate) {
        if (inheritedDate) {
          // Use the earlier date (more urgent)
          effectiveDate = originalDate < inheritedDate ? originalDate : inheritedDate;
        } else {
          effectiveDate = originalDate;
        }
      } else {
        effectiveDate = inheritedDate;
      }

      if (!item.isSomedayMaybeNote) {
        item.actionDate = effectiveDate;
      }

      // Push to stack as potential parent
      parentStack.push({ item, indentLength: currentIndentLength });

      allItems.push(item);
    }

    // Post-process: Calculate tree urgency (Bottom-up)
    // actionDate should reflect the most urgent date in the subtree
    const roots = allItems.filter((item) => !item.parent);
    roots.forEach((root) => this.calculateTreeUrgency(root));

    return roots;
  }

  private calculateTreeUrgency(item: TodoItem): DateTime | undefined {
    let minDate = item.actionDate;

    for (const child of item.children) {
      const childDate = this.calculateTreeUrgency(child);
      if (childDate) {
        if (!minDate || childDate < minDate) {
          minDate = childDate;
        }
      }
    }

    item.actionDate = minDate;
    return minDate;
  }

  private parseTask(filePath: string, entry: RegExpMatchArray): TodoItem {
    const todoItemOffset = 2; // Strip off `-|* `
    const status = entry[2] === 'x' ? TodoItemStatus.Done : TodoItemStatus.Todo;
    const description = entry[3];

    // Parse explicit date
    const originalDate = this.dateParser.parseDate(description);
    const descriptionWithoutDate = this.dateParser.removeDate(description);

    const somedayPattern = /#(someday)/gi;
    const isSomedayMaybeTask = somedayPattern.test(description);
    const descriptionClean = descriptionWithoutDate.replace(somedayPattern, '').trim();

    return new TodoItem(
      status,
      descriptionClean,
      isSomedayMaybeTask,
      filePath,
      (entry.index ?? 0) + todoItemOffset,
      entry[0].length - todoItemOffset,
      undefined, // actionDate will be set later
      0, // indentation set later
      originalDate, // originalDate
    );
  }
}
