## Purpose

定义无人值守的数字员工任务执行：headless CLI 以指定员工身份运行任务，任务自动转为 armed goal 并续轮至可判定终态，以稳定退出码向调用方（cron/wrapper）报告结果，并以持久化尝试台账实现"连续 3 次失败后挂起并通知"。

## Requirements

### Requirement: headless 员工任务入口

`dsh` 的 headless 运行 SHALL 支持 `--employee <id>` 标志：以该数字员工的已发布模板组合 root agent（权限白名单、experts、MCP、记忆注入与 Web 表面一致），任务文本作为首条用户消息进入。无 `--employee` 时行为不变。

#### Scenario: 以员工身份运行任务

- **WHEN** 调用 `dsh --profile headless --employee <id> "任务描述"`
- **THEN** 系统以员工 `<id>` 的模板组合创建 root agent 并投递任务文本，会话与其 Web 发起的会话共享同一员工组合语义

#### Scenario: 员工不存在时失败

- **WHEN** `--employee` 指向未注册或未激活的员工
- **THEN** 启动以非零退出码失败，错误信息指明未知员工标识，不创建任何会话

### Requirement: 任务自动 arm goal

headless 员工任务 SHALL 在会话创建时将任务文本作为 objective 自动创建并 arm goal；续轮由 goal round driver 驱动，无需人工输入。goal 终态（complete/blocked/budget-limited）即任务终态。

#### Scenario: 自动续轮至完成

- **WHEN** 任务 armed 后一轮未完成目标
- **THEN** round driver 自动注入下一轮直至 goal 进入终态或达到轮数上限

#### Scenario: 人工命令不被需要

- **WHEN** headless 员工任务运行全程
- **THEN** 不依赖任何交互式命令（如 `/goal`）即可完成 arm 与续轮

### Requirement: 退出码契约

headless 员工任务 SHALL 以稳定退出码报告终态：`0` = goal complete；`2` = goal blocked；`3` = budget-limited；启动组合失败使用 `1`。调用方 SHALL 能仅凭退出码决策。

#### Scenario: 完成退出

- **WHEN** goal 进入 complete
- **THEN** 进程以退出码 `0` 退出

#### Scenario: 受阻退出

- **WHEN** goal 进入 blocked（含 blockedReason）
- **THEN** 进程以退出码 `2` 退出，stderr 携带 blockedReason

### Requirement: 尝试台账与三次挂起

对同一任务键（员工 + 任务标识）的连续尝试 SHALL 持久化记录结果。每次尝试 SHALL 使用全新会话，并 SHALL 将失败原因写入员工 memory，使后续尝试的模型可见。连续 3 次尝试未 complete 后，系统 SHALL 停止自动重试、将该任务置为挂起态，并经 notification 能力发送告警；一次 complete SHALL 清零计数。

#### Scenario: 失败原因进记忆

- **WHEN** 一次尝试以 blocked 终止
- **THEN** 台账记录该次失败，且该员工 memory 含本次失败原因，下一次尝试的组合可检索到它

#### Scenario: 三连败挂起并通知

- **WHEN** 同一任务键连续第 3 次尝试仍未 complete
- **THEN** 任务置为挂起态，不再自动发起新尝试，且向已配置渠道发送一条含任务标识与前次失败原因摘要的通知

#### Scenario: 成功清零

- **WHEN** 挂起计数未达 3 时某次尝试 complete
- **THEN** 该任务键的连续失败计数清零，后续任务从 0 计数

### Requirement: 值班式成功静默

周期性（值班式）任务运行成功时 SHALL 不发送任何通知；notification 能力仅在第 3 次连续失败挂起等告警事件时使用。

#### Scenario: 成功不打扰

- **WHEN** 值班任务一次尝试 goal complete
- **THEN** 无通知发出，仅退出码 `0` 与台账记录
