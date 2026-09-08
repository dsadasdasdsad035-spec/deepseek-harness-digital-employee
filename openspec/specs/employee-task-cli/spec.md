## Purpose

定义 `dsh employee-task` 免引导子命令：不经 booted harness 直连台账锁事务的 list/resume/discard 行为与退出码契约。

## Requirements

### Requirement: 台账列表子命令

`dsh employee-task list` SHALL 按键序打印台账全部记录：键、显示名（缺省回退键名）、连败计数、挂起标记、最近原因。空台账 SHALL 打印空态提示并以 0 退出。

#### Scenario: 列出记录

- **WHEN** 台账存在记录且执行 `dsh employee-task list`
- **THEN** 每条记录一行输出，含键、显示名、计数与挂起状态，退出码 0

#### Scenario: 空台账

- **WHEN** 台账文件不存在或为空
- **THEN** 输出空态提示，退出码 0

### Requirement: 恢复与放弃子命令

`dsh employee-task resume <key>` SHALL 清除挂起标记并保留计数（与 Web 控制台恢复语义一致）；`dsh employee-task discard <key>` SHALL 删除记录。两者 SHALL 经与 runner/Web host 相同的带锁事务写回；未知键或（resume 时）非挂起键 SHALL 以退出码 1 与明确错误失败，台账不变。

#### Scenario: 恢复挂起键

- **WHEN** 对挂起键执行 `dsh employee-task resume <key>`
- **THEN** 挂起标记清除、计数保留，退出码 0

#### Scenario: 非法目标失败

- **WHEN** 对未知键执行 resume/discard，或对非挂起键执行 resume
- **THEN** stderr 输出明确错误，退出码 1，台账不变

### Requirement: 免引导与同锁一致性

子命令 SHALL 不启动 harness（无 profile、无 Agent），仅解析 `DSH_HOME` 定位台账；其全部写路径 SHALL 复用 `digital-employee-file` 的带锁事务，与 headless runner 及 Web host 串行化。

#### Scenario: 与运行中任务并发

- **WHEN** 子命令写台账的同时 headless runner 亦在写
- **THEN** 两笔写经同一锁串行化，无互相覆盖
