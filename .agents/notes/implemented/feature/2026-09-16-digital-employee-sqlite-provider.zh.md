# Agent Note: 数字员工 SQLite Provider

Status: implemented

[English](2026-09-16-digital-employee-sqlite-provider.md) | 中文

## 问题

数字员工的 provider 接缝此前只有一个实现：单个 JSON 文档在写锁下整体重写。记忆恰好是该格式服务得最差的工作负载——线上部署已经积累了多类写入方（web 服务、headless 员工 runner、管理 remote），每次变更都要重写整个文档，而锁会把无关进程串行化。接缝承诺"换后端不改 Consumer"，但没有任何第二个后端来证明它。

## 决策

`@deepseek-ai/dsh-digital-employee-sqlite` 在 `node:sqlite` 上实现了完整的 `DigitalEmployeeProvider`，web、headless-employee、digital-employee-suite 三个 bundle 改为挂载它而不是文件 provider。该 provider 遵循 session-persistence-sqlite 的纪律：保留 `application_id`、严格 `user_version` 且不做迁移、每次打开做规范模式对象比对、每次写事务内重新校验归属。跨进程协调交给 SQLite 自己的锁与 busy 超时，替代文件锁。

该 provider 通过构造方式保证提升与检索策略与文件 provider 完全一致：授权代数、记忆排序、可移植工件解析、审计脱敏检查和 `employees.json` 文档解析器都移入了 `@deepseek-ai/dsh-digital-employee`（`domain.ts`、`document.ts`、`ids.ts`），两个 provider 都调用它们。一次性旧数据导入：首次打开且数据库为空时，旁边的 `employees.json` 会被校验并在单个事务中导入，随后改名 `employees.json.imported`；之后手工删除数据库会再次导入归档。

文件 provider 保留在仓库中：测试 fixture 固定使用它（其快照手工写 `employees.json` 种子），自主任务台账包（`task-attempts`、`task-events`、`whereabouts`）也继续留在该包。

## 已考虑的替代方案

- **只把记忆三连拆成独立后端接缝**：`configureProvider` 是单槽位，且记忆行与实例生命周期绑定（级联删除、导出、导入），拆接缝会把员工数据分裂到两个存储，并为每个 Consumer 改动 provider 接口。
- **保留 JSON 文档并加锁**：更多协调不能修复整文档重写，且 web 与 headless 并发写入本就是部署现实。
- **采用外部记忆引擎（mem0）**：语义检索不是当前缺口——线上根本没有写入路径——而且它会给 keyless 覆盖增加网络依赖与不确定性。

## 后果

员工数据在每个部署中有了单一持久化归属，多进程写入是事务性的；SQLite 后端是交付默认值，文件后端保留为测试 fixture。检索语义保持不变（字面标签与内容匹配），检索升级仍是独立决策。旧数据导入只对空数据库执行，其解析规则就是共享文档解析器，格式漂移会在启动时响亮失败。
