import { extractTodoDatePropertyValue } from './TodoDateProperty';

describe('extractTodoDatePropertyValue', () => {
  test('extracts todo.date from frontmatter', () => {
    const contents = `---
todo:
  date: 2026-10-08
---

- [ ] Buy train ticket #T-1
`;

    expect(extractTodoDatePropertyValue(contents)).toBe('2026-10-08');
  });

  test('extracts todo.date when other properties surround it', () => {
    const contents = `---
title: Trip
todo:
  date: 2026-10-08
  owner: me
tags:
  - trip
---
`;

    expect(extractTodoDatePropertyValue(contents)).toBe('2026-10-08');
  });

  test('strips quotes around the value', () => {
    const contents = `---
todo:
  date: "2026-10-08"
---
`;
    expect(extractTodoDatePropertyValue(contents)).toBe('2026-10-08');

    const singleQuoted = `---
todo:
  date: '2026-10-08'
---
`;
    expect(extractTodoDatePropertyValue(singleQuoted)).toBe('2026-10-08');
  });

  test('ignores date keys outside the todo block', () => {
    const contents = `---
date: 2026-01-01
todo:
  owner: me
---
`;
    expect(extractTodoDatePropertyValue(contents)).toBeUndefined();
  });

  test('returns undefined without frontmatter', () => {
    expect(extractTodoDatePropertyValue('- [ ] Task')).toBeUndefined();
  });

  test('returns undefined when todo.date is absent', () => {
    const contents = `---
todo:
  owner: me
---
`;
    expect(extractTodoDatePropertyValue(contents)).toBeUndefined();
  });

  test('handles indented todo blocks and CRLF line endings', () => {
    const contents = '---\r\nsomething: else\r\ntodo:\r\n    date: 2026-10-08\r\n---\r\n';

    expect(extractTodoDatePropertyValue(contents)).toBe('2026-10-08');
  });
});
