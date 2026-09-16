# @deepseek-ai/dsh-digital-employee-sqlite

[English](README.md) | 中文

`@deepseek-ai/dsh-digital-employee` 的 SQLite 型 Provider。它把员工实例、长期记忆与审计记录存入 `$DSH_HOME/digital-employees/employees.db` 这一个仅所有者可访问的数据库中，提升与检索策略与文件型 Provider 完全一致。

## 配置

- `path` 选择显式数据库路径；进程内哨兵值 `:memory:` 打开非持久化数据库。
- `dshHome` 选择默认路径 `$DSH_HOME/digital-employees/employees.db` 所使用的 Harness 主目录。
- `allowSensitiveMemory` 允许提升敏感的长期记忆，默认值为 `false`。
- `maxRetentionDays` 限制请求的保留天数，默认值为 `3650`。
- `journalMode` 选择 SQLite `journal_mode` pragma，默认值为 `wal`；在 WAL 共享内存文件无法工作的文件系统上应选用回滚模式。
- `busyTimeoutMs` 限制等待竞争 SQLite 锁的最长时间，默认值为 `5000`。

数据库以 `trusted_schema = OFF`、`mmap_size = 0`、`foreign_keys = ON`、`synchronous = FULL` 打开。模式归属由保留的 `application_id` 与 `user_version` 标记；未标记版本的文件、外来 application id、错误版本或任何模式对象漂移都会使插件启动失败。每次写入事务在变更前都会重新校验归属，因此 headless 员工进程与 web 服务可以无文件锁地共享同一个数据库。

首次打开且数据库为空时，数据库旁的旧 `employees.json` 文档会在单个事务中导入，并被改名为 `employees.json.imported`。旧内容无法解析或不合法时启动失败；手工删除数据库后，剩余的归档会被再次导入。

记忆检索与提升策略与文件型 Provider 完全一致：按精确标签、部分标签、内容匹配排序，同分项依次按来源时间与记忆 ID 决出；缺少员工归属、规范化内容重复、未被允许的敏感候选项、超过 `maxRetentionDays` 的保留期都会被拒绝。删除员工会级联删除其记忆与审计记录。

## 模型体验

### 解析后的员工数据

#### 模型看到的内容

Consumer 可以从 `digital-employee/*` Session 事件渲染本 Provider 解析出的身份、权限与员工自有记忆。

#### Token 影响

Provider 本身不直接增加 token；Consumer 控制请求中包含的有界记忆内容。

#### KV Cache 影响

解析后的身份、权限或检索到的记忆发生变化时，Consumer 拥有的提示词前缀可能改变。

## 已知限制与后续工作

- **字面检索**：记忆排序基于精确/部分标签与内容匹配；语义或 embedding 检索保持推迟，直到存在真实的写入路径为其提供数据。
- **单进程连接**：每个 provider 实例持有一个 SQLite 连接；多进程访问通过 SQLite 锁协调，而非共享内存状态。
