import { DateTime } from 'luxon';

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
  parentId?: string;
  childIds?: string[];
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
  public parentId?: string;
  public childIds: string[];

  constructor(props: TodoItemProps) {
    this.taskId = props.taskId;
    this.sourceFilePath = props.sourceFilePath;
    this.startIndex = props.startIndex;
    this.length = props.length;
    this.status = props.status;
    this.description = props.description;
    this.originalDescription = props.originalDescription;
    this.isSomedayMaybeNote = props.isSomedayMaybeNote;
    this.parentId = props.parentId;
    this.childIds = props.childIds ?? [];
  }
}
