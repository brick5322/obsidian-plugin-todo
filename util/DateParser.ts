import { DateTime } from 'luxon';
import { extractTodoDatePropertyValue } from './TodoDateProperty';

export class DateParser {
  public static DateToken = '%date%';
  /** 相对日期标签前缀：`#T0`、`#T1`、`#T-7` */
  public static RelativeDateTagPrefix = '#T';
  /**
   * 匹配 `#T[n]`：n 为整数，无符号表示基准日之后的偏移，`-n` 表示提前。
   * Obsidian 标签字符白名单不含 `+`，因此不使用 `#T+1` 写法。
   */
  private static relativeDateRegexp = new RegExp(`${DateParser.RelativeDateTagPrefix}(-?\\d+)(?![0-9A-Za-z_/-])`);
  private dateFormat: string;
  private regexp: RegExp;

  constructor(tagFormat: string, dateFormat: string) {
    if (!tagFormat.includes(DateParser.DateToken)) {
      throw new Error(`Tag format must include the ${DateParser.DateToken} token.`);
    }
    this.dateFormat = dateFormat;

    const explanation = DateTime.fromFormatExplain('x', dateFormat);
    const pattern = explanation.regex;
    const patternString = pattern.toString().replace('/^', '').replace('$/i', '');

    const formatPattern = stringToPattern(tagFormat);
    const fullPattern = formatPattern.replace(new RegExp(DateParser.DateToken), `(${patternString})`);
    this.regexp = new RegExp(fullPattern);
  }

  public parseDate(source: string): DateTime | undefined {
    const matches = source.match(this.regexp);
    if (!matches) {
      return undefined;
    }
    return DateTime.fromFormat(matches[1], this.dateFormat);
  }

  public removeDate(source: string): string {
    return source.replace(this.regexp, '').trim();
  }

  /**
   * 解析 `#T[n]` 相对日期标签。
   *
   * 基准日 T 来自笔记 frontmatter 的 `todo.date` 属性；没有基准日时
   * `#T[n]` 只是普通标签，不做任何解析，也不应被移除。
   */
  public parseRelativeDate(source: string, baseDate?: DateTime): DateTime | undefined {
    if (!baseDate || !baseDate.isValid) {
      return undefined;
    }

    const matches = source.match(DateParser.relativeDateRegexp);
    if (!matches) {
      return undefined;
    }

    const offsetInDays = parseInt(matches[1], 10);
    if (isNaN(offsetInDays)) {
      return undefined;
    }

    return baseDate.startOf('day').plus({ days: offsetInDays });
  }

  /**
   * 读取笔记 frontmatter 的 `todo.date` 属性，并按 dateFormat 解析为基准日 T。
   */
  public parseTodoDateProperty(fileContents: string): DateTime | undefined {
    const rawValue = extractTodoDatePropertyValue(fileContents);
    if (rawValue === undefined) {
      return undefined;
    }

    const date = DateTime.fromFormat(rawValue, this.dateFormat);
    return date.isValid ? date.startOf('day') : undefined;
  }
}

const stringToPattern = (rawString: string) => {
  return rawString.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};
