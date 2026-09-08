## Purpose

定义通知能力缝：向外部渠道投递任务告警消息的统一服务契约，及其 generic-webhook、企业微信机器人、飞书机器人三个 Provider 的行为、凭证解析与失败上报。

## Requirements

### Requirement: 通知服务契约

系统 SHALL 提供 notification 能力：`send(request)` 接受渠道标识与消息（标题、正文、可选任务/会话上下文），返回投递结果。无 Provider 组合或渠道未配置时 SHALL 以可区分的失败结果上报，不静默丢弃。

#### Scenario: 投递告警

- **WHEN** 调用方以已配置渠道发送一条告警消息
- **THEN** 服务将该消息按渠道格式投递，并返回投递成功结果

#### Scenario: 渠道缺失失败可见

- **WHEN** 渠道标识未配置或无 Provider 可用
- **THEN** `send` 返回失败结果且原因指明缺失项，调用方可记录

### Requirement: 三个内置渠道 Provider

系统 SHALL 提供 `generic-webhook`、`wechat-work-bot`、`feishu-bot` 三个 Provider：generic-webhook POST 通用 JSON 载荷；wechat-work-bot 与 feishu-bot 按各自机器人 webhook 协议构造签名与载荷。

#### Scenario: 飞书机器人投递

- **WHEN** 以 `feishu-bot` 渠道发送消息且凭证有效
- **THEN** 按飞书机器人协议完成签名与 POST，响应非成功状态视为投递失败

#### Scenario: 企业微信机器人投递

- **WHEN** 以 `wechat-work-bot` 渠道发送消息且凭证有效
- **THEN** 按企业微信机器人协议完成 POST，响应非成功状态视为投递失败

### Requirement: 凭证经 credentials 解析

渠道的 webhook URL、secret/token SHALL 经 credentials 能力按引用名解析，SHALL NOT 作为 cordis.yml 配置明文出现。解析失败时该渠道上报未配置。

#### Scenario: 从环境凭证读取

- **WHEN** 渠道配置引用名为 `FEISHU_BOT_WEBHOOK` 的凭证且环境中存在
- **THEN** Provider 使用解析出的 URL 投递，配置文件中不出现明文 URL

#### Scenario: 凭证缺失

- **WHEN** 引用的凭证不存在于任何层
- **THEN** 该渠道以"未配置"失败结果上报，不尝试投递

### Requirement: 投递失败不阻塞任务

通知投递失败（网络错误、渠道拒绝）SHALL 上报为日志与返回结果，SHALL NOT 使发起通知的任务流程崩溃或重试风暴；Provider 内部 SHALL 有有限重试。

#### Scenario: 渠道宕机

- **WHEN** 目标 webhook 持续不可达
- **THEN** Provider 有限重试后返回失败结果，调用方任务状态不受影响
