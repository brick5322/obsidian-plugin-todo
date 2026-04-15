# 任务树重新设计文档

**日期**: 2026-04-15
**状态**: 已批准
**版本**: v1.0

---

## 一、设计目标

重构任务树核心逻辑，解决以下问题：

1. **日报重复记录** — 同一任务完成多次，或父子任务重复出现在日报
2. **父子任务完成语义混乱** — 完成子任务导致父任务也出现在日报
3. **setStatus 丢失日期标签** — 写入时使用已清除日期的 description
4. **任务定位信息丢失** — CompletedTask 丢失 startIndex 等精确定位信息
5. **代码职责不清** — Parser/Index/Tree 职责边界模糊

---

## 二、核心设计原则

| 原则 | 说明 |
|------|------|
| 纯内存，不持久化 | 任务树存于内存，启动时全量扫描，不依赖磁盘缓存 |
| 内容 Hash 去重 | `taskId = SHA256(filePath + description + indentation)` |
| Cascade Down 不记录日报 | 只有直接勾选的任务才记录日报，级联完成的不记录 |
| 分层展示，独立记录 | UI 中父子分层展示，完成时各自独立记录 |
| Hash 索引 + 树结构双轨 | `Map<taskId, TodoItem>` 扁平索引 + parent/children 树引用 |

---

## 三、架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        Vault Events                          │
│              (create / modify / delete / rename)              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                         Indexer                              │
│                   vault 事件监听器                            │
│         onCreate / onModify / onDelete / onRename            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Parser                                │
│              纯解析工具类 (stateless)                        │
│              parseFile(content) → TodoItem[]                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       TodoTree                               │
│                    单一数据源单例                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  hashIndex: Map<taskId, TodoItem>                    │    │
│  │  pathIndex: Map<filePath, TodoItem[]>               │    │
│  │  roots: TodoItem[]                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  + registerListener(listener)                                │
│  + getTaskById(taskId): TodoItem | undefined                 │
│  + getTasksByPath(filePath): TodoItem[]                      │
│  + getRoots(): TodoItem[]                                    │
│  + completeTask(taskId): void                                │
│  + rebuild(): void                                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Listeners                               │
│          (TodoItemView, DailyReportManager)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、组件职责

### 4.1 Parser（纯工具类）

**职责**：解析单个文件内容，返回扁平的任务列表

**接口**：
```typescript
class Parser {
  parseFile(filePath: string, content: string): ParseResult
}

interface ParseResult {
  items: TodoItem[];
  // 不再返回 roots，由 TodoTree 负责组织树结构
}
```

**变化**：
- 保持 stateless
- 生成 `taskId`（content hash）
- 不再构建树结构，只返回扁平列表
- 不再处理日期继承（由 TodoTree 统一处理）

### 4.2 TodoTree（核心单例）

**职责**：统一管理所有任务，维护索引，提供查询接口

**数据结构**：
```typescript
class TodoTree {
  // 索引
  private hashIndex: Map<string, TodoItem>;    // taskId → TodoItem
  private pathIndex: Map<string, TodoItem[]>;   // filePath → TodoItem[]

  // Daily Note 文件日期
  private fileDates: Map<string, DateTime>;      // filePath → DateTime (for Daily Notes)

  // 树结构（基于 hash 引用，而非内存引用）
  private rootIds: Set<string>;                  // 顶层任务 IDs

  // 监听器
  private listeners: ((tasks: TodoItem[]) => void)[];

  // 配置
  private settings: TodoPluginSettings;
}
```

**接口**：
```typescript
class TodoTree {
  // 初始化
  initialize(vault: Vault, settings: TodoPluginSettings): Promise<void>
  rebuild(): Promise<void>

  // 查询
  getTaskById(taskId: string): TodoItem | undefined
  getTasksByPath(filePath: string): TodoItem[]
  getRoots(): TodoItem[]
  getActionDate(taskId: string): DateTime | undefined  // 实时计算

  // 任务操作
  completeTask(taskId: string): void  // 含 cascade + 日报记录

  // 监听器
  registerListener(listener: (tasks: TodoItem[]) => void): void

  // 配置更新
  updateSettings(settings: TodoPluginSettings): void
}
```

**日期计算**（实时）：
```typescript
getActionDate(taskId: string): DateTime | undefined {
  const task = this.hashIndex.get(taskId);
  if (!task) return undefined;

  // 自有日期
  const selfDate = this.dateParser.parseDate(task.originalDescription);

  if (selfDate) {
    // 有自有日期：取 min(selfDate, parentDate)
    const parentDate = task.parentId ? this.getActionDate(task.parentId) : undefined;
    if (parentDate) {
      return selfDate < parentDate ? selfDate : parentDate;
    }
    return selfDate;
  }

  // 无自有日期：继承 parent
  if (task.parentId) {
    return this.getActionDate(task.parentId);
  }

  // 无 parent：使用文件日期（Daily Note）
  return this.fileDates.get(task.sourceFilePath);
}
```

### 4.3 Indexer（事件监听器）

**职责**：监听 vault 事件，触发 Parser 和 TodoTree 更新

**事件处理**：
```typescript
class Indexer {
  onCreate(file: TFile): void
  onModify(file: TFile): void
  onDelete(path: string): void
  onRename(file: TFile, oldPath: string): void
}
```

**注意**：Indexer 只负责调度，不持有任务数据。

### 4.4 DailyReportManager（日报管理器）

**职责**：管理完成记录和日报生成

**去重策略**：基于 content hash
```typescript
interface CompletedTaskRecord {
  taskId: string;           // content hash
  path: string;            // 文件路径
  content: string;         // 任务描述
  completedAt: string;     // ISO 时间戳
  subtasks: CompletedTaskRecord[];
  // isCascaded 不需要：只有直接完成的任务才会被记录
}
```

---

## 五、任务完成流程

```
用户勾选任务 T
        │
        ▼
TodoTree.completeTask(T.taskId)
        │
        ├── 检查 T 是否已被记录（hash 去重）
        │       已记录 → 直接返回，不重复记录
        │
        ├── cascadeDown(T)  // 递归标记所有子任务为 Done
        │       但标记为 "cascaded" 状态，不记录日报
        │
        └── 记录 T 到日报数据
                只有直接勾选的才记录
                isCascaded = false
```

**Cascade Down 伪代码**：
```typescript
private cascadeDown(taskId: string): void {
  const task = this.hashIndex.get(taskId);
  if (!task) return;

  for (const childId of task.childIds) {
    const child = this.hashIndex.get(childId);
    if (child && child.status === TodoItemStatus.Todo) {
      child.status = TodoItemStatus.CascadedDone;  // 级联完成状态
      this.cascadeDown(childId);
    }
  }
}
```

---

## 六、TodoItem 新数据结构

```typescript
interface TodoItem {
  // 身份标识
  taskId: string;           // SHA256(filePath + description + indentation)

  // 定位信息
  sourceFilePath: string;
  startIndex: number;
  length: number;

  // 任务内容
  status: TodoItemStatus;   // Todo | Done | CascadedDone
  description: string;       // 显示用，已清除日期和 #someday 标签
  originalDescription: string; // 回写文件用，保留原始完整文本（含日期标签）

  // 日期（实时计算，不存储）
  // actionDate 由 getActionDate(taskId) 按需计算：
  //   - 自有日期：从 originalDescription 解析
  //   - 无自有日期：继承 parent 的 actionDate
  //   - 无 parent 且无自有日期：使用文件日期（Daily Note）

  // Someday 标记
  isSomedayMaybeNote: boolean;

  // 树结构（基于 ID 引用）
  parentId?: string;
  childIds: string[];
}

enum TodoItemStatus {
  Todo,
  Done,           // 手动完成
  CascadedDone,   // 级联完成（cascade down），不记录日报
}
```

**注意**：
- 用 `parentId` 和 `childIds` 替代内存引用
- `originalDescription` 保留原始文本，用于 `setStatus` 写入文件
- 不再存储 `originalDate`，日期从 `originalDescription` 按需解析
- `TodoItemStatus.CascadedDone` 用于级联完成的子任务，清除时只需改状态值

---

## 七、日报数据结构

```typescript
interface DailyReportData {
  date: string;              // yyyy-MM-dd
  completedTasks: CompletedTaskRecord[];
}

interface CompletedTaskRecord {
  taskId: string;
  path: string;
  content: string;
  completedAt: string;
  isCascaded: boolean;       // false = 展示，true = 不展示
  subtasks: CompletedTaskRecord[];
}
```

**去重展示逻辑**：
```typescript
// CascadedDone 状态的任务不记录日报
// completeTask 只在 status === Todo 时记录
```

---

## 八、setStatus 修复

**问题**：原实现在 `TodoIndex.setStatus` 中使用已清除日期的 `description` 写入文件。

**修复**：
```typescript
setStatus(todo: TodoItem, newStatus: TodoItemStatus): void {
  const file = this.vault.getAbstractFileByPath(todo.sourceFilePath) as TFile;
  const fileContents = await this.vault.read(file);

  // 使用 originalDescription（保留日期标签）
  // Done 和 CascadedDone 都写作 [x]
  const isDone = newStatus === TodoItemStatus.Done || newStatus === TodoItemStatus.CascadedDone;
  const newTodo = `[${isDone ? 'x' : ' '}] ${todo.originalDescription}`;

  const newContents = c.substring(0, todo.startIndex) + newTodo + c.substring(todo.startIndex + todo.length);
  await this.vault.modify(file, newContents);
}
```

---

## 九、文件变更计划

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `model/TodoTree.ts` | 核心单例 |
| 新建 | `model/Parser.ts` | 纯解析工具类 |
| 新建 | `model/Indexer.ts` | vault 事件监听 |
| 新建 | `model/DailyReportManager.ts` | 日报管理 |
| 修改 | `model/TodoItem.ts` | 新增 taskId, parentId, childIds, isCascaded 等字段 |
| 修改 | `main.ts` | 简化为插件入口，委托 TodoTree |
| 删除 | `model/TodoParser.ts` | 迁移到 Parser.ts |
| 删除 | `model/TodoIndex.ts` | 迁移到 Indexer.ts + TodoTree.ts |

---

## 十、实现顺序

1. **第一步**：重构 `TodoItem` 数据结构
2. **第二步**：实现 `Parser`（纯工具类，stateless）
3. **第三步**：实现 `TodoTree` 单例
4. **第四步**：实现 `Indexer`
5. **第五步**：实现 `DailyReportManager`
6. **第六步**：修改 `main.ts` 集成新组件
7. **第七步**：修改 `TodoItemView` 使用新接口
8. **第八步**：测试和修复

---

## 十一、待确认问题

- [x] 简化日期存储 — 不存 `originalDate`，从 `originalDescription` 按需解析
- [x] actionDate 实时计算 — 不存储，通过 `getActionDate()` 按需计算
- [ ] Hash 算法选择（SHA256 实现）
- [ ] 任务描述中包含特殊字符时的处理
