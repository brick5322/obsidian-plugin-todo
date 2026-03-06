# 分层任务与日报生成方案设计

## 1. 背景与目标
用户希望支持缩进式的分层任务（Subtasks），并在任务展示、日报生成（包括 `data.json` 存储）中保留这种层级结构。同时，子任务需要继承父任务的日期，但如果子任务有更紧迫的显式日期，则覆盖继承的日期。

## 2. 核心需求
1.  **层级解析**：识别 Markdown 列表的缩进结构。
2.  **数据模型**：在 `TodoItem` 中表达父子关系或层级深度。
3.  **日期继承**：
    *   子任务默认继承父任务的日期。
    *   子任务若有显式日期，且比继承日期更早（更紧迫），则使用子任务日期。
4.  **展示与存储**：
    *   `TodoItemView` 需渲染树状结构。
    *   日报生成的 Markdown 需保留缩进。
    *   `data.json` 中的 `dailyReportData` 需存储层级信息。

## 3. 技术方案设计

### 3.1 模型层 (`TodoItem.ts`)
扩展 `TodoItem` 类，增加层级相关字段：
```typescript
export class TodoItem {
  // ... 现有字段
  public indentation: number; // 缩进层级 (0, 1, 2...); 无父级时为 0
  public parent?: TodoItem;   // 运行时构建树状结构时使用
  public children: TodoItem[]; // 子任务列表
  
  // 日期逻辑
  public originalDate?: DateTime; // 解析出的原始日期
  public effectiveDate?: DateTime; // 考虑继承后的生效日期
}
```

### 3.2 解析层 (`TodoParser.ts`)
当前正则 `/(-|\*) \[(\s|x)?\]\s(.*)/g` 可以匹配到列表项，但需结合 `entry.index` 回溯查找行首以计算缩进。

**解析逻辑变更**：
1.  保留现有正则匹配。
2.  **动态缩进判断**：
    *   比较当前行与上一行的前导空白字符长度。
    *   若当前行缩进 > 上一行缩进：层级 = 上一行层级 + 1（视为子级，无论缩进多少格）。
    *   若当前行缩进 == 上一行缩进：层级 = 上一行层级（视为同级）。
    *   若当前行缩进 < 上一行缩进：向上回溯查找缩进匹配的父级或同级节点。
    *   若无上一行（首行），层级为 0。

3.  遍历解析后的线性列表，构建树状结构：
    *   维护一个 `stack` 记录当前的父级链。
    *   根据 `indentation` 决定入栈、出栈或添加为兄弟节点。
4.  **计算生效日期 (`effectiveDate`)**：
    *   自顶向下遍历树。
    *   如果当前节点有 `originalDate`，则 `effectiveDate = originalDate`。
    *   否则，`effectiveDate = parent.effectiveDate`。

### 3.3 存储层 (`TodoPluginSettings.ts`)
修改 `dailyReportData` 结构以支持层级。

**旧结构**：
```typescript
completedTasks: { path: string; content: string }[]
```

**新结构**：
建议采用递归结构，以便于通过 JSON 直接恢复树状关系。
```typescript
interface CompletedTask {
  path: string;
  content: string;
  subtasks?: CompletedTask[]; // 递归定义
}

dailyReportData: {
  date: string;
  completedTasks: CompletedTask[];
}
```
*兼容性处理*：不兼容旧数据。若 `data.json` 数据结构不匹配，直接清空重置，以避免处理冗余和复杂性。

### 3.4 视图层 (`TodoItemView.ts`)
*   修改 `renderItems` 方法。
*   不再仅仅按目录分组，需在目录分组内部渲染任务树。
*   对于有子任务的项，递归创建 DOM 元素，并应用对应的缩进样式 (CSS `margin-left` 或 `padding-left`)。
*   **任务序列展示（Task Block）**：
    *   **移除目录分组头 (`todo-item-group-header`)**：不再以文件/目录为单位进行折叠分组，改为以**根任务（Root Task）**为展示单元。
    *   **统一块展示**：每一个根任务及其所有子任务构成一个独立的**任务块**。
        *   该块内包含该任务树的所有内容。
        *   **显示元数据**：在块内展示所属的文件目录路径（只展示一次）和最紧迫的生效日期。
    *   **对齐与交互**：
        *   **多选框与缩进**：块内每个任务（根任务及子任务）均渲染独立的勾选框。**勾选框左对齐不缩进**，仅任务描述文本根据层级进行缩进。
        *   **统一跳转**：整个任务块仅保留**一个**跳转按钮（Link Icon），点击跳转到根任务所在位置。

### 3.5 日报生成 (`main.ts`)
*   修改 `trackCompletedTask`：当任务完成时，需连同其完成的子任务（如果有）一起记录结构。
    *   *策略*：通常勾选父任务意味着子任务也完成，或者仅勾选子任务。日报通常记录“今天完成了什么”。
    *   如果勾选父任务，记录父任务本身。
    *   如果仅勾选子任务，需记录子任务，带上父任务。
*   修改 `formatTasksHierarchically`：
    *   现有的该方法是用于生成“文件路径目录树”。
    *   需将其扩展为支持“文件目录树 -> 任务层级树”的双重嵌套结构。
    *   渲染 Markdown 时，使用对应的缩进（`- ` vs `  - `）。

## 4. 实施步骤
1.  **Refactor Parser**: 修改 `TodoParser` 支持缩进计算和树构建。
2.  **Update Model**: 更新 `TodoItem` 添加 `children` 和日期继承逻辑。
3.  **Update Settings**: 更新 `dailyReportData` 类型定义。
4.  **Update View**: 重写 `TodoItemView` 渲染逻辑。
5.  **Update Daily Report**: 更新日报生成与存储逻辑。

## 5. 待确认问题
*   **部分完成**：如果父任务未完成，但子任务完成了，日报中如何展示？
    * 日报中向上展示，子任务展示层级，父任务展示本身。如果子任务完成了，它的层级关系出现在日报中。如果父任务完成了，只展示本身。
*   **排序**：树状结构下的排序（如按日期排序）应限制在同级节点内，还是打散树结构？
    * 保持树状结构优先，同级节点内按日期排序。
