## Purpose

定义通知渠道的 Web 设置面：渠道清单与凭证状态展示、测试发送动作，以及"不暴露凭证值"的边界。

## Requirements

### Requirement: 通知设置行

通用设置 SHALL 提供通知行，列出内置三渠道（feishu-bot / wechat-work-bot / generic-webhook）。每渠道 SHALL 展示其凭证引用（URL，及飞书的 secret）是否已配置，状态经 credentials 能力的 describe 查询，SHALL NOT 展示或传输任何凭证值。未挂载 notification 能力时该行 SHALL 隐藏。

#### Scenario: 展示渠道状态

- **WHEN** 打开通用设置且 notification 能力已组合
- **THEN** 三渠道各显示凭证已配置/未配置状态，页面不出现任何密文值

#### Scenario: 能力缺失时隐藏

- **WHEN** 组合中无 notification 服务
- **THEN** 设置中不出现通知行

### Requirement: 测试发送

每渠道 SHALL 提供"发送测试消息"动作：经 notification 能力向该渠道投递一条标记为测试的消息（标题含渠道标识与"test"字样），并把投递结果（成功/失败原因）反馈到界面。测试发送 SHALL 复用生产 `send` 契约，不新增旁路。

#### Scenario: 测试成功

- **WHEN** 凭证已配置且用户点击测试发送
- **THEN** 界面显示发送成功

#### Scenario: 凭证缺失的失败反馈

- **WHEN** 渠道凭证未配置时点击测试发送
- **THEN** 界面展示"未配置"的失败原因，不发起投递
