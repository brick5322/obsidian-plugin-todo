/**
 * 读取笔记 frontmatter（Obsidian Properties）中的 `todo.date` 原始值。
 *
 * 期望的写法：
 * ---
 * todo:
 *   date: 2026-10-08
 * ---
 *
 * 无 frontmatter、无 todo 块或无 date 键时返回 undefined。
 */
export const extractTodoDatePropertyValue = (fileContents: string): string | undefined => {
  const frontmatterMatch = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(fileContents);
  if (!frontmatterMatch) {
    return undefined;
  }

  const lines = frontmatterMatch[1].split(/\r?\n/);
  let todoIndent: number | undefined;

  for (const line of lines) {
    if (line.trim() === '' || /^\s*#/.test(line)) {
      continue;
    }

    const keyMatch = /^([ \t]*)([^ \t:#][^:]*?)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!keyMatch) {
      continue;
    }

    const indent = keyMatch[1].replace(/\t/g, '    ').length;
    const key = keyMatch[2].trim();
    const value = keyMatch[3].trim();

    if (todoIndent !== undefined && indent <= todoIndent) {
      // 缩进回到同级或更浅，说明 todo 块结束
      todoIndent = undefined;
    }

    if (todoIndent === undefined) {
      if (key === 'todo' && value === '') {
        todoIndent = indent;
      }
      continue;
    }

    if (key === 'date') {
      return stripQuotes(value);
    }
  }

  return undefined;
};

const stripQuotes = (value: string): string => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.substring(1, value.length - 1);
    }
  }
  return value;
};
