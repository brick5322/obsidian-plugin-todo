/**
 * 读取笔记 frontmatter（Obsidian Properties）中的扁平 `todo.date` 原始值。
 *
 * 期望写法（Obsidian Properties 点分 key）：
 * ---
 * todo.date: 2026-10-08
 * ---
 *
 * 无 frontmatter 或无 todo.date 键时返回 undefined。
 */
export const extractTodoDatePropertyValue = (fileContents: string): string | undefined => {
  const frontmatterMatch = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(fileContents);
  if (!frontmatterMatch) {
    return undefined;
  }
  for (const line of frontmatterMatch[1].split(/\r?\n/)) {
    const m = /^\s*todo\.date\s*:\s*(.*)$/.exec(line);
    if (m) {
      return stripQuotes(m[1].trim());
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