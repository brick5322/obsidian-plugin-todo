import { DateTime } from 'luxon';
import { buildRelativeDatePlans, removeRelativeDateTags } from './RelativeDatePlan';

test('removes relative-date tags from task-list display text', () => {
  expect(removeRelativeDateTags('Buy ticket #T-15')).toBe('Buy ticket');
  expect(removeRelativeDateTags('#T Pack bags')).toBe('Pack bags');
  expect(removeRelativeDateTags('Check #T0 then #T-1')).toBe('Check then');
  expect(removeRelativeDateTags('Keep #T+1 and #Travel')).toBe('Keep #T+1 and #Travel');
});

test('plans bare and offset relative-date tags with their resolved labels', () => {
  const source = 'Today #T, yesterday #T-1, unsupported #T+1';
  const baseDate = DateTime.fromISO('2026-10-08');

  expect(buildRelativeDatePlans(source, baseDate, (date) => date.toISODate(), [])).toEqual([
    {
      from: source.indexOf('#T'),
      to: source.indexOf('#T') + 2,
      sourceText: '#T',
      resolvedTag: '#2026-10-08',
      active: false,
    },
    {
      from: source.indexOf('#T-1'),
      to: source.indexOf('#T-1') + 4,
      sourceText: '#T-1',
      resolvedTag: '#2026-10-07',
      active: false,
    },
  ]);
});

test('marks a tag active when the editor selection touches its source range', () => {
  const source = 'Buy ticket #T-1';
  const tagStart = source.indexOf('#T-1');
  const baseDate = DateTime.fromISO('2026-10-08');

  const plans = buildRelativeDatePlans(source, baseDate, (date) => date.toISODate(), [
    { from: tagStart + 2, to: tagStart + 2 },
  ]);

  expect(plans[0].active).toBe(true);
});
