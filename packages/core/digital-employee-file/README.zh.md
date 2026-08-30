# @deepseek-ai/dsh-digital-employee-file

[English](README.md) | 中文

`@deepseek-ai/dsh-digital-employee` 的文件型 Provider。它把员工实例、长期记忆与审计记录存入 `$DSH_HOME/digital-employees` 下一个仅所有者可访问、带版本的 JSON 文档。

## 配置

- `path` 选择显式文档路径。
- `dshHome` 选择默认路径 `$DSH_HOME/digital-employees/employees.json` 所使用的 Harness 主目录。
- `allowSensitiveMemory` 允许提升敏感的长期记忆，默认值为 `false`。
- `maxRetentionDays` 限制请求的保留天数，默认值为 `3650`。

写入操作持有同级 writer lock，并通过原子 rename 发布完整文档。已有文档格式错误或 schema 版本未知时，插件启动失败。解析员工时要求实例处于活跃状态，并且已注册其精确模板版本。

记忆检索先按员工归属和请求的作用域筛选，再对不区分大小写的匹配结果排序。精确标签匹配优先于部分标签匹配和内容匹配；在应用显式结果上限前，同分项依次按来源时间和记忆 ID 排序。

以下情况会拒绝提升：缺少员工归属、规范化内容重复、`allowSensitiveMemory` 为 `false` 时候选项标记为敏感，或保留期超过 `maxRetentionDays`。策略失败会返回拒绝决定；接受的候选项会成为带来源与可选过期时间的长期记录。

## 模型体验

### 解析后的员工数据

#### 模型看到的内容

Consumer 可以从 `digital-employee/*` Session 事件渲染本 Provider 解析出的身份、权限与员工自有记忆。

#### Token 影响

Provider 本身不直接增加 token；Consumer 控制请求中包含的有界记忆内容。

#### KV Cache 影响

解析后的身份、权限或检索到的记忆发生变化时，Consumer 拥有的提示词前缀可能改变。

## 已知限制与后续工作

- **单个 JSON 文档**：大规模员工集合需要替换为数据库 Provider；Service Definition 允许在不改动 Consumer 的情况下替换实现。
