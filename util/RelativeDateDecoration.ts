import { EditorView, ViewPlugin, Decoration, DecorationSet, WidgetType, ViewUpdate } from '@codemirror/view';
import { Extension, Range } from '@codemirror/state';
import type { DateParser } from './DateParser';
import type { DateFormatter } from './DateFormatter';
import { buildRelativeDatePlans } from './RelativeDatePlan';

/** 光标离开相对日期标签时，把它渲染为可点击的绝对日期标签。 */
class ResolvedDateTagWidget extends WidgetType {
  constructor(readonly tag: string) {
    super();
  }

  eq(other: ResolvedDateTagWidget): boolean {
    return other.tag === this.tag;
  }

  toDOM(): HTMLElement {
    const anchor = document.createElement('a');
    anchor.className = 'tag';
    anchor.setAttribute('href', this.tag);
    anchor.textContent = this.tag;
    return anchor;
  }
}

function buildDecorations(view: EditorView, dateParser: DateParser, dateFormatter: DateFormatter): DecorationSet {
  const text = view.state.doc.toString();
  const baseDate = dateParser.parseTodoDateProperty(text);
  if (!baseDate) {
    return Decoration.none;
  }
  const decorations: Range<Decoration>[] = [];
  const plans = buildRelativeDatePlans(
    text,
    baseDate,
    (date) => dateFormatter.formatDate(date),
    view.state.selection.ranges,
  );
  for (const plan of plans) {
    if (!plan.active) {
      decorations.push(
        Decoration.replace({ widget: new ResolvedDateTagWidget(plan.resolvedTag) }).range(plan.from, plan.to),
      );
    }
  }
  return Decoration.set(decorations, true);
}

export const relativeDateEditorExtension = (dateParser: DateParser, dateFormatter: DateFormatter): Extension =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, dateParser, dateFormatter);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, dateParser, dateFormatter);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
