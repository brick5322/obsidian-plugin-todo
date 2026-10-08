/** @jest-environment jsdom */

import { resolveRelativeDateTag } from './RelativeDateDom';

test('replaces a relative tag anchor with the resolved date tag', () => {
  document.body.innerHTML = '<p><a class="tag" href="#T-1">#T-1</a></p>';
  const anchor = document.querySelector('a') as HTMLAnchorElement;
  const textNode = anchor.firstChild as Text;

  resolveRelativeDateTag(textNode, '2026-10-07');

  expect(anchor.textContent).toBe('#2026-10-07');
  expect(anchor.getAttribute('href')).toBe('#2026-10-07');
  expect(anchor.nextSibling).toBeNull();
});

test('updates the existing anchor without adding child elements', () => {
  document.body.innerHTML = '<p><a class="tag" href="#T-1">#T-1</a></p>';
  const anchor = document.querySelector('a') as HTMLAnchorElement;
  const textNode = anchor.firstChild as Text;

  resolveRelativeDateTag(textNode, '2026-10-07');
  resolveRelativeDateTag(textNode, '2026-10-07');

  expect(anchor.childNodes).toHaveLength(1);
});
