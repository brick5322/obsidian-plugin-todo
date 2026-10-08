export function resolveRelativeDateTag(textNode: Text, formattedDate: string): void {
  const parent = textNode.parentElement;
  if (parent?.classList.contains('tag')) {
    const resolvedTag = `#${formattedDate}`;
    textNode.data = resolvedTag;
    parent.setAttribute('href', resolvedTag);
  }
}
