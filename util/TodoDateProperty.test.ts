import { extractTodoDatePropertyValue } from './TodoDateProperty';

describe('extractTodoDatePropertyValue', () => {
  test('extracts flattened todo.date from frontmatter', () => {
    const contents = `---
title: Trip
todo.date: 2026-10-08
tags:
  - trip
---
`;

    expect(extractTodoDatePropertyValue(contents)).toBe('2026-10-08');
  });

  test('extracts todo.date when it is the only property', () => {
    const contents = `---
todo.date: 2026-10-08
---
`;

    expect(extractTodoDatePropertyValue(contents)).toBe('2026-10-08');
  });

  test('strips quotes around the value', () => {
    expect(extractTodoDatePropertyValue(`---\ntodo.date: "2026-10-08"\n---\n`)).toBe('2026-10-08');
    expect(extractTodoDatePropertyValue(`---\ntodo.date: '2026-10-08'\n---\n`)).toBe('2026-10-08');
  });

  test('handles CRLF line endings', () => {
    expect(extractTodoDatePropertyValue('---\r\ntodo.date: 2026-10-08\r\n---\r\n')).toBe('2026-10-08');
  });

  test('does not treat other dotted keys as todo.date', () => {
    const contents = `---
owner.name: me
todo.owner: me
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
});