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
    // A 方案：整个标签 replace 成一个带日期的 tag 块，仅用 Obsidian 原生 hashtag class（沿用原样式）
    span.className = 'cm-hashtag';
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
    // A 方案：把整个 #T[n] 替换成一个带解析日期的 tag 块（同背景一体）
    const label = `${match[0]} (${dateFormatter.formatDate(date)})`;
    decorations.push(
      Decoration.replace({ widget: new RelativeDateWidget(label) }).range(match.index, tagEnd)
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