## Purpose

定义账户体系：邮箱注册（验证码）、邮箱密码登录/登出（会话 cookie）、忘记密码（邮件重置链接）、argon2id 存储、登录限速与防枚举、首启 owner 引导，以及未认证对 Web 全表面的拦截。

## ADDED Requirements

### Requirement: 邮箱注册与验证

注册 SHALL 要求邮箱 + 密码：提交后向该邮箱发送 6 位验证码（10 分钟有效、单次使用），验证通过才创建用户。已注册邮箱的注册请求 SHALL 返回与成功路径一致的通用响应（防枚举），不发送验证码。`allowRegistration` 配置为 false 时 SHALL 拒绝所有注册并提示关闭。

#### Scenario: 注册并验证成功

- **WHEN** 用户提交未注册邮箱、收到验证码并正确提交
- **THEN** 创建 `user` 角色账户（ownerId 预埋字段写入自身 id），可直接登录

#### Scenario: 已注册邮箱防枚举

- **WHEN** 用户以已注册邮箱请求注册
- **THEN** 响应与未注册邮箱一致（通用文案），且不发送任何邮件

#### Scenario: 注册开关关闭

- **WHEN** `allowRegistration: false` 且访问注册
- **THEN** 返回注册已关闭的明确提示

### Requirement: 邮箱密码登录与登出

登录 SHALL 校验 email + argon2id 密码，成功后签发签名会话 cookie（HttpOnly、SameSite=Lax），会话具有可配置有效期；登出 SHALL 立即失效该会话。密码或邮箱错误 SHALL 返回统一的通用错误（不区分原因）。禁用账户 SHALL 拒绝登录。

#### Scenario: 登录成功

- **WHEN** 凭证正确且账户未禁用
- **THEN** 签发会话 cookie 并进入工作台

#### Scenario: 通用错误防枚举

- **WHEN** 密码错误或邮箱不存在
- **THEN** 返回同一条"邮箱或密码错误"，可从响应与耗时上不区分两种情况

#### Scenario: 禁用账户

- **WHEN** 被管理员禁用的账户尝试登录
- **THEN** 返回账户已禁用的明确错误，不签发会话

### Requirement: 登录限速

登录与验证码接口 SHALL 实施限速：同一邮箱连续失败 5 次后锁定 15 分钟（期间一律拒绝并提示剩余时间）；同一 IP 的请求频率 SHALL 有全局上限。

#### Scenario: 连续失败触发锁定

- **WHEN** 同一邮箱连续 5 次登录失败
- **THEN** 第 6 次起 15 分钟内一律拒绝，正确密码亦不例外

### Requirement: 忘记密码重置

忘记密码 SHALL 流程化：提交邮箱 → （仅已注册时）发送重置链接（含单次使用 token，15 分钟过期）→ 用户经链接设置新密码 → 旧会话全部失效。邮件能力未组合或邮箱未注册时 SHALL 返回与成功一致的通用提示（防枚举）。

#### Scenario: 重置成功

- **WHEN** 已注册用户在 15 分钟内经有效 token 设置新密码
- **THEN** 密码更新为 argon2id 新哈希，该用户全部既有会话失效，token 作废

#### Scenario: 过期或复用 token

- **WHEN** token 超过 15 分钟或已被使用
- **THEN** 拒绝并要求重新发起流程

### Requirement: 未认证拦截与首启 owner 引导

未持有有效会话时，Web SHALL 拦截全部页面与 RPC，仅放行登录/注册/忘记密码/验证码与静态资源。用户库为空时 SHALL 强制进入 owner 创建页（email+密码），创建完成前其余功能不可用；首个账户角色为 `owner`。

#### Scenario: 未认证访问被拦截

- **WHEN** 无有效会话访问任意工作台页面或 RPC
- **THEN** 重定向/响应至登录页；放行清单外的路径一律拒绝

#### Scenario: 首启创建 owner

- **WHEN** 用户库为空且首个访问者完成 owner 创建表单
- **THEN** 创建 `owner` 角色账户并直接登录，此后不再出现引导页
