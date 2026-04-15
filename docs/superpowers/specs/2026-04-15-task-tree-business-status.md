# 任务树业务现状文档

**日期**: 2026-04-15
**目的**: 梳理任务树生成机制，识别已知问题，为后续改造提供基础

---

## 一、任务树生成流程

### 1.1 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `TodoPlugin` | `main.ts` | 入口，注册视图/设置哨兵，协调各方 |
| `TodoIndex` | `model/TodoIndex.ts` | 全量扫描 vault，维护 `Map<path, TodoItem[]>`，监听 vault 事件 |
| `TodoParser` | `model/TodoParser.ts` | 单文件解析，构建父子树，计算日期继承 |
| `TodoItem` | `model/TodoItem.ts` | 数据模型：status, description, parent/children, actionDate |

### 1.2 数据流

```
Obsidian Vault
     │
     ▼
TodoIndex.initialize()
  ├─ 遍历所有 .md 文件
  ├─ 调用 TodoParser.parseTasks(filePath, content)
  │    ├─ 正则匹配 `- [ ]` 或 `* [ ]`
  │    ├─ 基于缩进的栈算法构建父子关系
  │    ├─ 日期继承计算
  │    └─ 后处理：子树最小日期向上传播
  └─ 返回 roots 列表（children 内嵌）
     │
     ▼
TodoIndex.invokeListeners()
  └─ 通知所有 listener（目前只有 TodoPlugin.tick）
     │
     ▼
TodoPlugin.tick(todos)
  └─ TodoItemView.setProps({ todos })
     │
     ▼
TodoItemView 渲染（Today/Scheduled/Inbox/Someday 四面板）
```

---

## 二、任务树构建算法

### 2.1 父子关系构建

**位置**: `model/TodoParser.ts:32-49`

```typescript
// 栈式算法：维护 parentStack
while (parentStack.length > 0 &&
       currentIndentLength <= parentStack[parentStack.length - 1].indentLength) {
  parentStack.pop(); // 弹出缩进 >= 当前行的项
}
const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1].item : undefined;
```

**关键点**:
- 缩进标准化：tab → 4 空格
- `currentIndentLength <= parentStack top` 时弹出（同级或更浅也弹出）
- 相同缩进的连续任务被视为兄弟节点

### 2.2 日期继承规则

**位置**: `model/TodoParser.ts:51-75`

```
继承优先级:
1. 有 originalDate → min(originalDate, inheritedDate)
2. 无 originalDate → inheritedDate (parent.actionDate 或 fileDate)

特殊情况:
- #someday 标签: actionDate 不设置（保持 undefined）
- Daily Note 文件: fileDate = 从路径解析的日期
```

### 2.3 子树紧迫性传播

**位置**: `model/TodoParser.ts:83-88`

后处理自底向上：root.actionDate = min(root.actionDate, 所有 child.actionDate)

---

## 三、已知问题

### 3.1 日报重复记录问题

**问题描述**: 完成一个父任务及其多个子任务时，日报中会出现重复条目。

**根本原因**: `trackCompletedTask` 调用 `mapToCompletedTask`，后者会递归将**整个子树**打包为一个 `CompletedTask`：

```typescript
// main.ts:93-102
private mapToCompletedTask(todo: TodoItem): CompletedTask {
  const task: CompletedTask = { path: todo.sourceFilePath, content: todo.description };
  if (todo.children && todo.children.length > 0) {
    task.subtasks = todo.children.map((child) => this.mapToCompletedTask(child));
  }
  return task;
}
```

**复现场景**:
1. 父任务 P 有子任务 A、B
2. 完成 A → `dailyReportData.completedTasks` 添加 `{P, subtasks: [A, B]}`
3. 完成 B → `dailyReportData.completedTasks` 再次添加 `{P, subtasks: [A, B]}`
4. 完成 P → `dailyReportData.completedTasks` 第三次添加 `{P, subtasks: [A, B]}`

**日报输出**: 同样的 `{P, [A, B]}` 出现 3 次

**涉及代码**:
- `main.ts:104-135` - `trackCompletedTask()`
- `main.ts:93-102` - `mapToCompletedTask()`

### 3.2 子任务完成导致父任务也出现在日报问题

**问题描述**: 完成子任务后，日报中同时出现子任务和父任务条目。

**根本原因**: `generateDailySummary` 扫描**当前仍为 Todo 的任务**，`mapToCompletedTask` 同样递归打包子树。当父任务仍为 Todo 时，它会在扫描中被添加为"明日工作"，同时子任务在"今日工作"中。

**复现场景**:
1. 父任务 P (Todo) 有子任务 A、B
2. 完成 A → A 进入 `dailyReportData.completedTasks`，P 仍为 Todo
3. 生成日报时:
   - `completedTasks` 中有 A（来自 settings）
   - 扫描 vault 发现 P 仍为 Todo → `nextTasks` 添加 `mapToCompletedTask(P)` = `{P, subtasks: [A, B]}`
   - 日报中 A 和 P(A,B) 同时出现

**涉及代码**:
- `main.ts:272-358` - `generateDailySummary()`
- `main.ts:310-319` - 扫描时过滤逻辑

### 3.3 日报生成时重复追加内容

**问题描述**: 每次生成日报，会在已有内容基础上追加，造成重复。

**根本原因**: `generateDailySummary` 直接 `vault.modify(file, summaryContent)`，将本次生成的内容覆盖文件。但如果 `dailyReportData` 中的任务和扫描出的任务有重叠，会导致重复。

**涉及代码**:
- `main.ts:341` - `await this.app.vault.modify(file, summaryContent);`

### 3.4 任务树无持久化

**问题描述**: `TodoIndex` 在内存中维护 `Map<path, TodoItem[]>`，每次 Obsidian 启动时全量重建。

**涉及代码**:
- `model/TodoIndex.ts:20-44` - `initialize()` 每次全量扫描
- `model/TodoIndex.ts:21` - 已有 TODO 注释: `// TODO: persist index & last sync timestamp`

### 3.5 任务状态修改的异步问题

**问题描述**: `setStatus` 是异步的，但没有 await，且修改后的回调中 `todo.description` 已被清除了日期信息。

**涉及代码**:
- `model/TodoIndex.ts:46-54` - setStatus 写入时用 `todo.description`（已清除日期和 #someday 标签），原始文本的日期信息丢失

---

## 四、TodoItem 数据结构

```typescript
class TodoItem {
  // 定位信息
  sourceFilePath: string;  // 所在文件
  startIndex: number;      // 在文件中的起始位置
  length: number;          // 文本长度

  // 任务状态
  status: TodoItemStatus;  // Todo | Done
  description: string;      // 描述（已清除日期和 #someday）
  isSomedayMaybeNote: boolean;

  // 日期
  actionDate?: DateTime;    // 实际生效日期（继承后）
  originalDate?: DateTime;  // 原始日期（用户写的）

  // 树结构
  indentation: number;       // 缩进层级
  parent?: TodoItem;
  children: TodoItem[] = [];
}
```

**注意**: `parent` 和 `children` 是内存引用，不支持序列化。

---

## 五、CompletedTask 数据结构（日报用）

```typescript
interface CompletedTask {
  path: string;           // 文件路径
  content: string;         // 任务描述
  subtasks?: CompletedTask[];  // 子任务（递归）
}
```

**问题**: 丢失了 `startIndex`、`indentation` 等定位信息，无法精确定位源文件中的任务。

---

## 六、后续改造建议

### 6.1 任务树单例

将任务树独立为单例 `TodoTree`，承载：
- `Map<path, TodoItem[]>` - 按文件索引
- `Map<taskId, TodoItem>` - 全局按 ID 索引（需要生成稳定 ID）
- 任务 → 文件/行号 的映射关系

### 6.2 去重机制

日报记录时：
- 使用 `sourceFilePath + startIndex` 作为唯一标识
- 记录时检查是否已存在
- 仅记录被完成的那个任务，不递归整个子树

### 6.3 父子任务完成逻辑

当子任务完成时：
- 判断父任务是否所有子任务都已完成
- 只有父任务所有子任务都完成时，才将父任务标记为可完成的
- 日报中只展示叶节点完成，或根据业务规则展示

---

## 七、关键代码位置索引

| 功能 | 文件:行号 |
|------|----------|
| 任务树解析入口 | `model/TodoParser.ts:13-89` |
| 父子关系栈算法 | `model/TodoParser.ts:32-49` |
| 日期继承计算 | `model/TodoParser.ts:51-75` |
| 树紧迫性传播 | `model/TodoParser.ts:83-105` |
| 任务完成记录 | `main.ts:104-135` |
| 日报生成 | `main.ts:272-358` |
| 日报去重展示 | `main.ts:168-270` |
| 任务状态修改 | `model/TodoIndex.ts:46-54` |
