import { DateTime } from 'luxon';

const relativeDateTagPatternSource = '#T(-?\\d+)?(?![+0-9A-Za-z_/-])';

export interface RelativeDateRange {
  from: number;
  to: number;
}

export interface RelativeDatePlan extends RelativeDateRange {
  sourceText: string;
  resolvedTag: string;
  active: boolean;
}

export function buildRelativeDatePlans(
  source: string,
  baseDate: DateTime,
  formatDate: (date: DateTime) => string,
  activeRanges: readonly RelativeDateRange[],
): RelativeDatePlan[] {
  const tagPattern = new RegExp(relativeDateTagPatternSource, 'g');
  const plans: RelativeDatePlan[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(source)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const offset = match[1] === undefined ? 0 : parseInt(match[1], 10);
    const date = baseDate.startOf('day').plus({ days: offset });
    const active = activeRanges.some((range) => range.from <= to && range.to >= from);
    plans.push({
      from,
      to,
      sourceText: match[0],
      resolvedTag: `#${formatDate(date)}`,
      active,
    });
  }

  return plans;
}

export function removeRelativeDateTags(source: string): string {
  return source
    .replace(new RegExp(relativeDateTagPatternSource, 'g'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
