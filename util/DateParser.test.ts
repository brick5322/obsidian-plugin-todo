import { DateTime } from 'luxon';
import { DateParser } from './DateParser';

test('initializing the date parser without the date token', () => {
  expect(() => new DateParser('something else', 'yyyy-MM-dd')).toThrow('Tag format must include the %date% token.');
});

test('initializing the date parser with an invalid date format', () => {
  const dateParser = new DateParser('%date%', 'bogus');
  const contents = `This is a string that contains a date: 2020-02-16.`;
  const date = dateParser.parseDate(contents);
  expect(date).toBeUndefined();
});

test('extracting a date in a valid, simple format', () => {
  const dateParser = new DateParser(DateParser.DateToken, 'yyyy-MM-dd');
  const contents = `This is a string that contains a date: 2021-02-16.`;
  const date = dateParser.parseDate(contents);
  expect(date.day).toEqual(16);
  expect(date.month).toEqual(2);
  expect(date.year).toEqual(2021);
});

test('removing a date in a valid, simple format', () => {
  const dateParser = new DateParser(DateParser.DateToken, 'yyyy-MM-dd');
  const contents = `This is a string that contains a date: 2021-02-16.`;
  const contentsWithoutDate = dateParser.removeDate(contents);
  expect(contentsWithoutDate).toEqual('This is a string that contains a date: .');
});

test('only the first date is extracted', async () => {
  const dateParser = new DateParser(DateParser.DateToken, 'yyyy-MM-dd');
  const contents = `This is a string that contains not one date: 2021-02-16 but two: 2020-04-28.`;
  const date = dateParser.parseDate(contents);
  expect(date.day).toEqual(16);
  expect(date.month).toEqual(2);
  expect(date.year).toEqual(2021);
});

test('trying to extract a date that is not there', () => {
  const dateParser = new DateParser(DateParser.DateToken, 'yyyy-MM-dd');
  const contents = `This is a string that does not contain a date.`;
  const date = dateParser.parseDate(contents);
  expect(date).toBeUndefined();
});

test('extracting a date if the tag format contains date special regex characters', async () => {
  const dateParser = new DateParser(`[[${DateParser.DateToken}]]`, 'yyyy-MM-dd');
  const contents = `This is a string that contains a date: [[2021-02-16]] in a more complex format.`;
  const date = dateParser.parseDate(contents);
  expect(date.day).toEqual(16);
  expect(date.month).toEqual(2);
  expect(date.year).toEqual(2021);
});

test('extracting a date if the tag format contains date format tokens', () => {
  const dateParser = new DateParser(`Due:${DateParser.DateToken}`, 'yyyy-MM-dd');
  const contents = `A very custom tag. Due:2021-02-16.`;
  const date = dateParser.parseDate(contents);
  expect(date.day).toEqual(16);
  expect(date.month).toEqual(2);
  expect(date.year).toEqual(2021);
});

describe('relative date tags (#T[n])', () => {
  const dateParser = new DateParser(`#${DateParser.DateToken}`, 'yyyy-MM-dd');
  const baseDate = DateTime.fromFormat('2026-10-08', 'yyyy-MM-dd');

  test('should resolve #T0 to the base date', () => {
    expect(dateParser.parseRelativeDate('Buy ticket #T0', baseDate)?.toISODate()).toBe('2026-10-08');
  });

  test('should treat a bare #T tag as #T0', () => {
    expect(dateParser.parseRelativeDate('Buy ticket #T', baseDate)?.toISODate()).toBe('2026-10-08');
  });

  test('should resolve an unsigned offset as days after the base date', () => {
    expect(dateParser.parseRelativeDate('Buy ticket #T1', baseDate)?.toISODate()).toBe('2026-10-09');
  });

  test('should resolve a negative offset as days before the base date', () => {
    expect(dateParser.parseRelativeDate('Buy ticket #T-1', baseDate)?.toISODate()).toBe('2026-10-07');
    expect(dateParser.parseRelativeDate('Buy ticket #T-7', baseDate)?.toISODate()).toBe('2026-10-01');
  });

  test('should not resolve #T[n] without a base date', () => {
    expect(dateParser.parseRelativeDate('Buy ticket #T1', undefined)).toBeUndefined();
  });

  test('should not resolve the unsupported #T+1 form', () => {
    expect(dateParser.parseRelativeDate('Buy ticket #T+1', baseDate)).toBeUndefined();
  });

  test('should not resolve tags that merely start with #T', () => {
    expect(dateParser.parseRelativeDate('Buy ticket #T1abc', baseDate)).toBeUndefined();
    expect(dateParser.parseRelativeDate('Buy ticket #T1/note', baseDate)).toBeUndefined();
    expect(dateParser.parseRelativeDate('Buy ticket #travel', baseDate)).toBeUndefined();
  });

  test('should keep #T[n] when removing date tags', () => {
    expect(dateParser.removeDate('Buy ticket #T-1')).toBe('Buy ticket #T-1');
  });
});

describe('todo.date frontmatter property', () => {
  const dateParser = new DateParser(`#${DateParser.DateToken}`, 'yyyy-MM-dd');

  test('should parse todo.date from the frontmatter', () => {
    const contents = `---
todo.date: 2026-10-08
---

- [ ] Buy ticket #T-1
`;

    expect(dateParser.parseTodoDateProperty(contents)?.toISODate()).toBe('2026-10-08');
  });

  test('should return undefined without frontmatter or without the property', () => {
    expect(dateParser.parseTodoDateProperty('- [ ] Buy ticket #T-1')).toBeUndefined();

    const withoutProperty = `---
todo:
  owner: me
---
`;
    expect(dateParser.parseTodoDateProperty(withoutProperty)).toBeUndefined();
  });

  test('should return undefined for an invalid date value', () => {
    const contents = `---
todo:
  date: not-a-date
---
`;
    expect(dateParser.parseTodoDateProperty(contents)).toBeUndefined();
  });
});
