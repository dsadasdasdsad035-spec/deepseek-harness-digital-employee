## MODIFIED Requirements

### Requirement: 值班式成功静默

周期性（值班式）任务的完成通知 SHALL 默认静默。部署可通过 `successDigestChannel` 配置 opt-in 的聚合摘要：成功运行累计计数，当距上次摘要不小于 `successDigestEveryHours`（默认 24 小时）且有累计成功时，经该渠道发送一条聚合摘要（含累计成功数与起始时间）并重置窗口。摘要发送失败 SHALL 保留累计状态并在下次成功重试。挂起告警行为不变；`successDigestChannel` 未配置时行为与原先完全一致（成功零通知）。

#### Scenario: 默认静默不变

- **WHEN** 未配置 `successDigestChannel` 且值班任务完成
- **THEN** 无通知发出，仅退出码 0 与台账记录

#### Scenario: opt-in 聚合摘要

- **WHEN** 配置了 `successDigestChannel` 且窗口期内累计 N 次成功、间隔到达
- **THEN** 经该渠道发送一条含 N 的聚合摘要，窗口重置

#### Scenario: 摘要失败保留状态

- **WHEN** 摘要投递失败
- **THEN** 累计状态保留，下次成功重试发送
