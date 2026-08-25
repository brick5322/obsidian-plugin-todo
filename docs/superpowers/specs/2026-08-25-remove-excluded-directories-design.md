# 删除排除文件夹功能设计

## 目标

彻底删除通过插件设置按目录路径排除任务文件的功能。文件是否进入任务树，今后只由 frontmatter `gtd.task` 的就近继承规则决定。

## 删除范围

- 从 `TodoPluginSettings` 与 `DEFAULT_SETTINGS` 删除 `excludedDirectories`。
- 从设置页删除“排除文件夹”输入框。
- 从中英文 locale 删除对应名称和说明。
- 从 `main.ts` 删除路径匹配函数以及设置更新时的排除回调更新。
- 从 `Indexer` 删除路径排除回调、更新方法以及重建循环中的路径判断。
- 更新设置和 Indexer 单元测试，使其反映新的构造参数与索引行为。

## 索引流程

Indexer 遍历 Vault 中的全部 Markdown 文件，并先调用 `TaskFileFilter.shouldInclude(file)`：

- 返回 `true`：读取并解析文件任务。
- 返回 `false`：跳过文件。

Indexer 不再执行任何基于目录字符串前缀的硬排除。frontmatter `gtd.task: true`、`gtd.task: false` 和未设置时的继承规则成为唯一文件级筛选机制。

## 旧数据处理

不主动修改或迁移 `data.json`。旧数据中的 `excludedDirectories` 属性不再由类型、默认设置或业务逻辑读取，对功能没有影响。这样避免插件升级时产生与用户请求无关的数据文件写入。

## 测试

- `TodoPluginSettings.test.ts` 继续断言默认设置只包含仍受支持的字段。
- `Indexer.test.ts` 删除硬排除场景，验证所有 Markdown 文件都会进入 frontmatter 筛选器，只有筛选器允许的文件才会读取和解析。
- 运行全量 Jest 测试、Rollup 构建、Prettier 和 Git 空白检查。

## 非目标

- 不删除或重写用户 `data.json` 中的历史字段。
- 不新增替代设置项。
- 不改变 `gtd.task` 的继承与优先级规则。
