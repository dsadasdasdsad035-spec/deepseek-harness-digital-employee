## Purpose

定义邮件能力缝：`ctx.email.send` 的契约、QQ 邮箱 SMTP provider 的凭证解析与投递行为、未组合时的 fail-visible 语义。

## ADDED Requirements

### Requirement: 邮件发送契约

系统 SHALL 提供 email 能力：`send({to, subject, text})` 返回封闭投递结果（delivered/reason），永不 reject。SMTP 主机、端口、账号、授权码 SHALL 经 credentials 引用解析；任一引用未解析 SHALL 返回"未配置"失败结果而不尝试投递。

#### Scenario: 投递成功

- **WHEN** SMTP 凭证全部配置且执行 send
- **THEN** 经 SMTP 服务器投递并返回 delivered

#### Scenario: 凭证未配置

- **WHEN** SMTP 账号或授权码引用未解析
- **THEN** 返回 `{delivered: false, reason: 未配置}`，不发起连接

### Requirement: QQ 邮箱 SMTP provider

系统 SHALL 提供基于 QQ 邮箱 SMTP（smtp.qq.com:465 SSL）的 provider：账号为 QQ 邮箱地址、密码为授权码（非登录密码），均经凭证引用解析。连接或认证失败 SHALL 经有限重试后返回失败原因。

#### Scenario: 授权码错误

- **WHEN** 授权码无效且执行 send
- **THEN** 有限重试后返回 `{delivered: false}` 且原因含 SMTP 认证失败信息

### Requirement: 值不跨配置面

SMTP 凭证 SHALL 只存在于 credentials 存储与环境，SHALL NOT 出现在 cordis.yml、代码或任何日志输出中；日志只记录投递结果与引用名。

#### Scenario: 日志与配置无值

- **WHEN** 检查任意配置文件与投递日志
- **THEN** 授权码与密码值不出现在任何输出或配置中，仅出现引用名与投递结果
