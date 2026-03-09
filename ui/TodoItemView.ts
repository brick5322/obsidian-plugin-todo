import { DateTime } from 'luxon';
import { ItemView, MarkdownRenderer, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_TODO } from '../constants';
import { TodoItem, TodoItemStatus } from '../model/TodoItem';
import { RenderIcon, Icon } from '../ui/icons';
import { t } from '../lang/helpers';

enum TodoItemViewPane {
  Today,
  Scheduled,
  Inbox,
  Someday,
}
export interface TodoItemViewProps {
  todos: TodoItem[];
  formatDate: (date: DateTime) => string;
  openFile: (filePath: string) => void;
  toggleTodo: (todo: TodoItem, newStatus: TodoItemStatus) => void;
  onGenerateDailySummary: () => void;
}

interface TodoItemViewState {
  activePane: TodoItemViewPane;
}

export class TodoItemView extends ItemView {
  private props: TodoItemViewProps;
  private state: TodoItemViewState;

  constructor(leaf: WorkspaceLeaf, props: TodoItemViewProps) {
    super(leaf);
    this.props = props;
    this.state = {
      activePane: TodoItemViewPane.Today,
    };
  }

  getViewType(): string {
    return VIEW_TYPE_TODO;
  }

  getDisplayText(): string {
    return 'Todo';
  }

  getIcon(): string {
    return 'checkmark';
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  public setProps(setter: (currentProps: TodoItemViewProps) => TodoItemViewProps): void {
    this.props = setter(this.props);
    this.render();
  }

  private setViewState(newState: TodoItemViewState) {
    this.state = newState;
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.createDiv('todo-item-view-container', (el) => {
      el.createDiv('todo-item-view-toolbar', (el) => {
        this.renderToolBar(el);
      });
      el.createDiv('todo-item-view-items', (el) => {
        this.renderItems(el);
      });
      el.createDiv('todo-item-view-footer', (el) => {
        el.createEl('button', { text: t('GENERATE_DAILY_SUMMARY') }, (btn) => {
          btn.onClickEvent(() => this.props.onGenerateDailySummary());
          btn.style.width = '100%';
        });
      });
    });
  }

  private renderToolBar(container: HTMLDivElement) {
    const activeClass = (pane: TodoItemViewPane) => {
      return pane === this.state.activePane ? ' active' : '';
    };

    const setActivePane = (pane: TodoItemViewPane) => {
      const newState = {
        ...this.state,
        activePane: pane,
      };
      this.setViewState(newState);
    };

    container.createDiv(`todo-item-view-toolbar-item${activeClass(TodoItemViewPane.Today)}`, (el) => {
      el.appendChild(RenderIcon(Icon.Today, 'Today'));
      el.onClickEvent(() => setActivePane(TodoItemViewPane.Today));
    });
    container.createDiv(`todo-item-view-toolbar-item${activeClass(TodoItemViewPane.Scheduled)}`, (el) => {
      el.appendChild(RenderIcon(Icon.Scheduled, 'Scheduled'));
      el.onClickEvent(() => setActivePane(TodoItemViewPane.Scheduled));
    });
    container.createDiv(`todo-item-view-toolbar-item${activeClass(TodoItemViewPane.Inbox)}`, (el) => {
      el.appendChild(RenderIcon(Icon.Inbox, 'Inbox'));
      el.onClickEvent(() => setActivePane(TodoItemViewPane.Inbox));
    });
    container.createDiv(`todo-item-view-toolbar-item${activeClass(TodoItemViewPane.Someday)}`, (el) => {
      el.appendChild(RenderIcon(Icon.Someday, 'Someday / Maybe'));
      el.onClickEvent(() => setActivePane(TodoItemViewPane.Someday));
    });
  }

  private renderItems(container: HTMLDivElement) {
    const roots = this.props.todos.filter((t) => !t.parent);
    const visibleRoots = roots.filter((root) => this.shouldShowInPane(root));

    visibleRoots.sort((a, b) => {
      const dateA = this.getTreeMostUrgentDate(a);
      const dateB = this.getTreeMostUrgentDate(b);

      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.valueOf() - dateB.valueOf();
    });

    visibleRoots.forEach((root) => {
      this.renderTaskBlock(container, root);
    });
  }

  private shouldShowInPane(root: TodoItem): boolean {
    const urgentDate = this.getTreeMostUrgentDate(root);
    const today = DateTime.now();

    const isToday = (date: DateTime) => {
      return date.hasSame(today, 'day');
    };

    const isBeforeToday = (date: DateTime) => {
      return date < today.startOf('day');
    };

    const isTodayUrgent = urgentDate && (isToday(urgentDate) || isBeforeToday(urgentDate));
    const isScheduledUrgent = urgentDate && !isTodayUrgent;

    switch (this.state.activePane) {
      case TodoItemViewPane.Inbox:
        return !urgentDate && !root.isSomedayMaybeNote && root.status !== TodoItemStatus.Done;
      case TodoItemViewPane.Scheduled:
        return !!isScheduledUrgent;
      case TodoItemViewPane.Someday:
        return !urgentDate && root.isSomedayMaybeNote && root.status !== TodoItemStatus.Done;
      case TodoItemViewPane.Today:
        return !!isTodayUrgent;
    }
  }

  private getTreeMostUrgentDate(item: TodoItem): DateTime | undefined {
    let minDate: DateTime | undefined = undefined;

    if (item.status === TodoItemStatus.Todo && item.actionDate) {
      minDate = item.actionDate;
    }

    for (const child of item.children) {
      const childDate = this.getTreeMostUrgentDate(child);
      if (childDate) {
        if (!minDate || childDate < minDate) {
          minDate = childDate;
        }
      }
    }

    return minDate;
  }

  private renderTaskBlock(container: HTMLDivElement, root: TodoItem) {
    const block = container.createDiv('todo-item-block');
    const header = block.createDiv('todo-item-block-header');

    const infoContainer = header.createDiv('todo-item-block-info');
    const titleEl = infoContainer.createDiv({ cls: 'todo-item-block-title' });
    titleEl.setText(root.description);

    const temp = document.createElement('div');
    MarkdownRenderer.renderMarkdown(root.description, temp, root.sourceFilePath, this).then(() => {
      titleEl.setText(temp.textContent || root.description);
    });

    const lastSlash = root.sourceFilePath.lastIndexOf('/');
    const directory = lastSlash !== -1 ? root.sourceFilePath.substring(0, lastSlash) : '/';
    infoContainer.createDiv({ text: directory, cls: 'todo-item-block-path' });

    const urgentDate = root.actionDate;
    if (urgentDate) {
      infoContainer.createDiv({
        text: this.props.formatDate(urgentDate),
        cls: `todo-item-block-date ${this.getDateClass(urgentDate)}`,
      });
    } else if (root.isSomedayMaybeNote) {
      infoContainer.createDiv({
        text: 'Someday',
        cls: 'todo-item-block-date todo-date-someday',
      });
    }

    const link = header.createDiv('todo-item-block-link');
    link.appendChild(RenderIcon(Icon.Reveal, 'Open file'));
    link.onClickEvent(() => {
      this.props.openFile(root.sourceFilePath);
    });

    const treeContainer = block.createDiv('todo-item-tree');
    this.renderTaskTree(treeContainer, root, 0);
  }

  private getDateClass(date: DateTime): string {
    const today = DateTime.now().startOf('day');
    const target = date.startOf('day');
    if (target < today) return 'todo-date-overdue';
    if (target > today) return 'todo-date-future';
    return 'todo-date-today';
  }

  private renderTaskTree(container: HTMLElement, item: TodoItem, level: number) {
    const row = container.createDiv('todo-item-row');

    const checkboxContainer = row.createDiv('todo-item-checkbox-container');
    const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
    checkbox.checked = item.status === TodoItemStatus.Done;
    checkbox.onClickEvent(() => this.props.toggleTodo(item, TodoItemStatus.toggleStatus(item.status)));

    const descContainer = row.createDiv('todo-item-desc-container');
    descContainer.style.paddingLeft = `${level * 10}px`;

    if (item.originalDate) {
      const dateClass = this.getDateClass(item.originalDate);
      if (dateClass === 'todo-date-overdue') descContainer.classList.add('todo-text-overdue');
      else if (dateClass === 'todo-date-today') descContainer.classList.add('todo-text-today');
    }

    MarkdownRenderer.renderMarkdown(item.description, descContainer, item.sourceFilePath, this);

    item.children.forEach((child) => {
      this.renderTaskTree(container, child, level + 1);
    });
  }
}
