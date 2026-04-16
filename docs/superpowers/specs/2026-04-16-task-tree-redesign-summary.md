# 任务树系统重构总结

## 完成日期
2026-04-16

## 问题修复

### 1. 子任务显示问题
- **原因**：Parser 没有传递 `indentation` 字段给 TodoItem
- **修复**：在 Parser.ts 中添加 `indentation` 字段传递

### 2. 任务完成状态同步到文件
- **问题**：勾选 checkbox 后内存状态更新，但没有写回源文件
- **修复**：
  - `syncTasksToFile()` - 批量同步任务状态到文件
  - `collectAllChildren()` - 递归收集所有子任务
  - 完成/取消完成时都会同步到文件

### 3. 级联完成/取消
- **问题**：完成父任务时子任务状态没有同步到文件
- **修复**：
  - `completeTask()` - 级联设置子任务为 CascadedDone
  - `uncompleteTask()` - 恢复任务及子任务状态
  - 同步时递归处理所有子任务

### 4. 缩进层级计算
- **问题**：原逻辑假设每个层级固定 2 空格，不能处理 0-2-4-8 或 0-2-4-2 等不规则缩进
- **修复**：基于实际空格数动态计算层级
  - 相同缩进 = 同层级
  - 比最大缩进大 = 更深层级
  - 未见过且不比最大缩进大 = 层级跨越错误

### 5. Hash 碰撞问题
- **问题**：不同父任务下的同名子任务 hash 相同导致碰撞
- **修复**：Hash 计算加入父任务 `originalDescription`
  ```
  hashInput = `${filePath}|${parentDescription}|${indentation}|${originalDescription}`
  ```

### 6. 文件修改后状态覆盖
- **问题**：Indexer's modify 事件触发 fullRebuild，用旧缓存覆盖内存状态
- **修复**：添加 `rebuildForFile()` 支持增量更新单文件

### 7. 解析错误提示
- **问题**：层级跨越时没有报错，用户不知道出了问题
- **修复**：
  - TodoItem 添加 `parseError` 字段
  - UI 显示错误警告图标

### 8. 日报按钮显示控制
- **问题**：未开启日报时仍然显示按钮
- **修复**：
  - TodoItemViewProps 添加 `enableDailyReport`
  - 根据设置显示/隐藏 footer 按钮
  - 设置变更时实时更新视图

## 新增文件

| 文件 | 说明 |
|------|------|
| `model/Parser.ts` | 纯解析工具类，解析 markdown 文件生成 TodoItem[] |
| `model/Indexer.ts` | Vault 事件监听器，文件变更时触发 rebuild |
| `model/TodoTree.ts` | 任务树管理，支持全量/增量重建，级联完成/取消 |
| `model/DailyReportManager.ts` | 日报记录管理（已整合到 main.ts） |

## 删除文件

| 文件 | 说明 |
|------|------|
| `model/TodoParser.ts` | 被 Parser.ts 替代 |
| `model/TodoIndex.ts` | 被 TodoTree.ts 替代 |

## 架构

```
Vault (Obsidian)
    │
    ▼
   Indexer ────────► Parser ──► TodoItem[]
    │                              │
    │                         TodoTree
    │                              │
    │                    ┌────────┴────────┐
    │                    ▼                 ▼
    │              HashIndex          PathIndex
    │                    │                 │
    └────────────────────┴─────────────────┘
                            │
                            ▼
                      TodoPlugin
                            │
                            ▼
                      TodoItemView
```

## 核心数据结构

### TodoItem
```typescript
interface TodoItem {
  taskId: string;           // Hash: filePath|parentDesc|indent|origDesc
  sourceFilePath: string;
  startIndex: number;
  length: number;
  status: TodoItemStatus;   // Todo, Done, CascadedDone
  description: string;      // 显示用，已清除日期和 #someday
  originalDescription: string; // 回写文件用
  isSomedayMaybeNote: boolean;
  indentation: number;       // 实际空格数
  parentId?: string;
  childIds: string[];
  parseError?: string;       // 解析错误信息
}
```

### TodoTree
```typescript
class TodoTree {
  private hashIndex: Map<string, TodoItem>;  // taskId → TodoItem
  private pathIndex: Map<string, TodoItem[]>; // filePath → items
  private rootIds: Set<string>;
  private fileDates: Map<string, DateTime>;

  rebuild(items: TodoItem[]): void;
  rebuildForFile(filePath: string, items: TodoItem[]): void;
  completeTask(taskId: string): TodoItem[];
  uncompleteTask(taskId: string): void;
  getActionDate(item: TodoItem): DateTime | undefined;
}
```

## 提交记录

| 提交 | 说明 |
|------|------|
| c41bbdc | refactor: 删除旧的任务解析文件 |
| 6eb615b | fix(model/Parser): 修复缩进计算和 hash 生成 |
| 52e30fd | feat(model/TodoItem): 添加 parseError 字段 |
| eb0b978 | feat(model/TodoTree): 修复缩进逻辑、添加增量更新和取消完成 |
| c5273f8 | feat(model/Indexer): 添加 Parser 依赖支持文件重解析 |
| 6d1dcb4 | feat(ui): 更新 TodoItemView 支持新接口 |
| 3cda7db | feat(main): 集成新组件实现文件同步和级联操作 |
| a6477cb | docs: 更新任务树设计文档和 CLAUDE.md |