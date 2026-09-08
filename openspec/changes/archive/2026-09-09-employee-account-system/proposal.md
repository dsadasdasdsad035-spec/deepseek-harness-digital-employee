## Why

数字员工产品要走向发布后收费，账号体系是收费的地基：注册/登录是收费主体，邮箱验证保证账号真实，找回密码保证可自助恢复，管理后台支撑运营。当前 Web 表面（127.0.0.1:3080）完全无用户概念，任何能访问端口的人都可以操作全部员工与任务。

## What Changes

- 新增 `email` 能力缝：`ctx.email.send({to, subject, text})`，QQ 邮箱 SMTP provider（host/user/pass 经 credentials 引用解析，绝不入配置文件）；未组合时邮件路径 fail-visible 禁用
- 新增 `user-accounts` 能力缝：SQLite 用户表（users.db，`ownerId` 字段预埋为多租户终态）、argon2id 密码哈希、注册（邮箱验证码）、登录（签名会话 cookie + 登录限速）、忘记密码（邮件重置链接：单次使用 15 分钟过期）、登出
- Web 表面接入：未认证拦截全部页面与 RPC（登录/注册/忘记密码/验证码页除外）；登录后进入原工作台
- 管理后台：administrator 角色新增用户管理 remote 组（列表/创建/重置密码/禁用/启用/删除/调整角色），最后一个 owner 保护
- 首启引导：库中无用户时首访问强制创建 owner（email+密码），此后注册页是否开放由 `allowRegistration` 配置（默认关）

### 非目标（后续阶段）

- 阶段 2：任务配额/用量计费接 token-meter、ownerId 数据隔离强制
- 阶段 3：在线支付（微信/支付宝/Stripe）、订阅与额度
- 第三方 OAuth 登录、多因素认证

## Capabilities

### New Capabilities

- `email-sending`: 邮件能力缝：send 契约、QQ 邮箱 SMTP provider、凭证引用解析、未组合时的 fail-visible 行为
- `user-accounts`: 账户体系：注册（邮箱验证码）、登录/登出（会话 cookie）、忘记密码（重置链接）、argon2id 存储、登录限速、防枚举、首启 owner 引导
- `user-administration`: 管理后台用户管理：列表/创建/重置密码/禁用/删除/角色调整，owner 保护的边界

### Modified Capabilities

（无——既有能力不改变行为；认证拦截是 Web 传输层新增前置，管理 remote 的 administrator 语义不变。）

## Impact

- 新包：`packages/email/email`（能力缝 + QQ SMTP provider）、`packages/account/user-accounts`（SQLite + argon2id + 会话）
- 修改：`packages/host/webserver`（未认证拦截 + 登录/注册/重置页面路由）、`packages/host/apiproxy`（认证 gate + 账户 RPC）、`packages/host/digital-employee-management`（用户管理 remote 组，administrator gate）
- 新依赖：argon2（密码哈希）、nodemailer（SMTP）——均为维护良好的标准库
- 凭证引用（经 credentials 库存储，不入仓库）：`SMTP_USER`、`SMTP_PASS`、`SESSION_SECRET`
- 凭据导入：实施时把用户提供的 QQ 邮箱授权码导入本机凭据库（不落仓库、不写死）
