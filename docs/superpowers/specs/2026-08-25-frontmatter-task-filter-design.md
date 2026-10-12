# Frontmatter 任务筛选设计

## 目标

根据目标文件及其上级目录说明文件的 frontmatter `gtd.task` 布尔属性，决定是否把目标文件中的 TODO 收录进任务树。

## 筛选规则

筛选属性有三个状态：

- `gtd.task: true`：收录该文件中的任务。
- `gtd.task: false`：不收录该文件中的任务。
- 未设置：继续向上查找规则。

规则按距离目标文件由近到远查找，遇到第一个有效指令后立即停止：

1. 目标 Markdown 文件自身。
2. 目标文件所在目录的同名 Markdown 文件。
3. 逐级向上的父目录同名 Markdown 文件。

例如，对于 `Projects/Alpha/Note.md`，检查顺序为：

1. `Projects/Alpha/Note.md`
2. `Projects/Alpha/Alpha.md`
3. `Projects/Projects.md`

目标文件恰好也是某一级目录说明文件时，同一路径只检查一次。Vault 根目录没有对应的目录同名文件。

如果整个查找链上都没有筛选指令，则默认收录。较近层级的指令总是覆盖较远层级的指令，因此当前目录的 `gtd.task: true` 可以覆盖父目录的 `gtd.task: false`，目标文件自身的 `gtd.task: false` 也可以覆盖目录的 `gtd.task: true`。

只接受 YAML 布尔值 `true` 和 `false`。字符串 `"true"`、`"false"` 或其他类型视为没有指令，继续向上查找。

## 架构

新增 `TaskFileFilter`，只负责回答一个问题：给定 `TFile`，是否应索引其中的任务。

`TaskFileFilter` 依赖 Obsidian 的 `Vault` 与 `MetadataCache`：

- 通过 `MetadataCache.getFileCache()` 获取文件 frontmatter。
- 读取 frontmatter 的 `gtd.task` 属性并验证其为布尔值。
- 通过 `Vault.getAbstractFileByPath()` 查找各级目录同名文件。
- 生成从目标文件到父目录说明文件的候选路径，并去重后按顺序求值。

`Indexer` 在读取和解析 Markdown 内容之前调用筛选器。首次索引也统一通过 `Indexer` 的公开重建入口执行，避免 `main.ts` 与 `Indexer.ts` 保留两份扫描逻辑。

## 数据流

1. Indexer 取得 Vault 中的 Markdown 文件列表。
2. `TaskFileFilter.shouldInclude(file)` 按就近顺序解析 frontmatter 指令。
3. 返回 `false` 时跳过文件；返回 `true` 时读取内容并交给 `Parser`。
4. 所有收录文件的解析结果用于重建 `TodoTree`。

## 更新与缓存

创建、修改、删除或重命名 Markdown 文件时，现有 Vault 事件仍会触发全量重建。由于 frontmatter metadata 可能晚于 Vault `modify` 事件更新，Indexer 同时监听 `MetadataCache` 的 `changed` 事件；缓存更新完成后再次重建，确保目录指令的变化最终应用到所有后代文件。

连续事件可能造成重复重建，但本次设计不引入防抖或增量依赖图；先保持行为简单正确，后续有性能数据时再优化。

## 错误处理

- 找不到目录同名文件：继续检查更上一级。
- 文件没有 metadata cache 或没有 frontmatter：视为没有指令，继续查找。
- `gtd.task` 不是布尔值：视为没有指令，继续查找。

筛选错误不阻止其他文件建立索引。

## 测试

为 `TaskFileFilter` 添加独立单元测试，覆盖：

- 没有任何指令时默认收录。
- 文件自身的 `gtd.task: true` 和 `gtd.task: false`。
- 当前目录说明文件继承。
- 多级目录中较近规则覆盖较远规则。
- 文件自身规则覆盖目录规则。
- 目标文件也是目录说明文件时不重复判断。
- 非布尔属性值不生效并继续继承。

为 `Indexer` 添加集成级单元测试，验证 frontmatter 排除文件不会进入 Parser，以及 metadata 变化会触发重建。最后运行完整 Jest 测试与项目构建。

## 非目标

- 不在设置页增加开关或自定义属性名称。
- 不支持 tags 或正文行内标签作为筛选指令。
- 不实现增量计算目录规则影响范围或重建防抖。
