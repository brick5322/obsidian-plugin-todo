export enum TodoItemStatus {
  Todo = 0,
  Done = 1,
  CascadedDone = 2,  // 级联完成，不记录日报
}

export interface TodoItemProps {
  taskId: string;
  sourceFilePath: string;
  startIndex: number;
  length: number;
  status: TodoItemStatus;
  description: string;       // 显示用，已清除日期和 #someday 标签
  originalDescription: string; // 回写文件用，保留原始完整文本
  isSomedayMaybeNote: boolean;
  indentation?: number;      // 用于树构建，Parser 会提供
  parentId?: string;
  childIds?: string[];
  parseError?: string;       // 解析错误信息，如"层级跨越"
}

export class TodoItem {
  public readonly taskId: string;
  public sourceFilePath: string;
  public startIndex: number;
  public length: number;
  public status: TodoItemStatus;
  public description: string;
  public originalDescription: string;
  public isSomedayMaybeNote: boolean;
  public indentation: number;
  public parentId?: string;
  public childIds: string[];
  public parseError?: string;  // 解析错误信息

  constructor(props: TodoItemProps) {
    this.taskId = props.taskId;
    this.sourceFilePath = props.sourceFilePath;
    this.startIndex = props.startIndex;
    this.length = props.length;
    this.status = props.status;
    this.description = props.description;
    this.originalDescription = props.originalDescription;
    this.isSomedayMaybeNote = props.isSomedayMaybeNote;
    this.indentation = props.indentation ?? 0;
    this.parentId = props.parentId;
    this.childIds = props.childIds ?? [];
    this.parseError = props.parseError;
  }
}
