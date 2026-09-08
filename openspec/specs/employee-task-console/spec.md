## Purpose

定义数字员工自主任务的 Web 管理面：挂起任务中心的数据 remote、恢复与放弃动作、员工工作区任务视图，以及台账记录的显示名兼容语义。

## Requirements

### Requirement: 挂起任务列表 remote

host SHALL 提供只读 remote 列出台账中的任务记录：任务键、员工标识、连续失败计数、挂起态、最近失败原因、显示名。显示名 SHALL 取记录的 `displayName` 字段，记录缺失该字段时 SHALL 回退为该次任务文本的截断形式。无台账文件时 SHALL 返回空列表。

#### Scenario: 列出挂起任务

- **WHEN** 台账中存在 `suspended: true` 的记录且前端请求列表
- **THEN** 返回该记录，含任务键、连续失败计数、最近失败原因与显示名

#### Scenario: 旧记录兼容

- **WHEN** 台账记录早于 `displayName` 字段引入（无该字段）
- **THEN** 列表项显示名回退为截断的任务文本，不报错

### Requirement: 恢复挂起任务

host SHALL 提供恢复 remote：校验目标任务键当前确为挂起态，清除挂起标记并保留失败计数语义（恢复后下一次 complete 清零、再一次失败重新累计并在达到上限时再次挂起），原子写回台账。非挂起键的恢复请求 SHALL 以可区分错误失败。恢复 SHALL NOT 自动发起任务重试；重试由部署侧调度在下一周期拉起。

#### Scenario: 恢复成功

- **WHEN** 对挂起任务键调用恢复 remote
- **THEN** 台账该键清除 `suspended`，写回为原子操作

#### Scenario: 恢复非挂起任务被拒

- **WHEN** 对未挂起（或不存在）的任务键调用恢复 remote
- **THEN** 返回可区分的错误，台账不变

### Requirement: 放弃挂起任务

host SHALL 提供放弃 remote：删除目标任务键的台账记录。放弃后同键任务从零计数。

#### Scenario: 放弃清除记录

- **WHEN** 对挂起任务键调用放弃 remote
- **THEN** 该键从台账移除，后续同键任务从零计数

### Requirement: 员工工作区任务视图

数字员工工作区 SHALL 提供任务视图：按台账列出该员工的任务（完成静默不在此展示为历史，仅挂起与失败中计数），挂起项提供恢复与放弃动作，动作结果以界面状态反馈（成功/失败原因）。动作 SHALL 经 host remote 单一写路径完成，UI SHALL NOT 直接读写台账文件。

#### Scenario: 恢复动作走 remote

- **WHEN** 用户在任务视图点击恢复
- **THEN** 界面调用恢复 remote 并根据返回更新行状态；失败时展示错误原因

#### Scenario: 恢复后列表刷新

- **WHEN** 恢复 remote 成功返回
- **THEN** 该任务行的挂起标记消失，失败计数保留展示

### Requirement: 台账并发写安全

台账的读-改-写事务（headless runner 的计数/挂起写入与 Web host 的恢复/放弃写入）SHALL 通过同一带锁机制串行化，杜绝并发下的更新丢失。

#### Scenario: 恢复与计数并发

- **WHEN** headless 进程落败计数的同时 Web host 恢复同键任务
- **THEN** 两笔写都生效于同一文件且后写基于先写的结果，无互相覆盖
