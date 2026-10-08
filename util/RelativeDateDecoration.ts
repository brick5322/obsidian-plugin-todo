import { EditorView, ViewPlugin, Decoration, DecorationSet, WidgetType, ViewUpdate } from '@codemirror/view';
import { Range } from '@codemirror/state';
import type { DateParser } from './DateParser';
import type { DateFormatter } from './DateFormatter';

/** 在编辑模式（Source / Live Preview）中，于 `#T[n]` 标签后追加解析出的真实日期。 */
class RelativeDateWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: RelativeDateWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'todo-item-relative-date';
    span.textContent = this.text;
    return span;
  }
}

function buildDecorations(
  view: EditorView,
  dateParser: DateParser,
  dateFormatter: DateFormatter
): DecorationSet {
  const text = view.state.doc.toString();
  const baseDate = dateParser.parseTodoDateProperty(text);
  if (!baseDate) {
    return Decoration.none;
  }
  const relativeTag = /#T(-?\d+)(?![0-9A-Za-z_/-])/g;
  const decorations: Range<Decoration>[] = [];
  let match: RegExpExecArray | null;
  while ((match = relativeTag.exec(text)) !== null) {
    const tagEnd = match.index + match[0].length;
    const date = baseDate.plus({ days: +match[1] });
    const label = ` (${dateFormatter.formatDate(date)})`;
    decorations.push(
      Decoration.widget({ widget: new RelativeDateWidget(label), side: 1 }).range(tagEnd, tagEnd)
    );
  }
  return Decoration.set(decorations, true);
}

export const relativeDateEditorExtension = (
  dateParser: DateParser,
  dateFormatter: DateFormatter
) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, dateParser, dateFormatter);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, dateParser, dateFormatter);
        }
      }
    },
    { decorations: (value) => value.decorations }
  );