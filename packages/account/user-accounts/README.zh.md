# @deepseek-ai/dsh-user-accounts

[English](README.md) | 中文

DeepSeek Harness Web 表面的账户系统：SQLite 用户存储（node:sqlite）、argon2id 密码哈希、邮箱验证码、单次密码重置令牌、HMAC 签名会话 cookie、登录限速（5 次失败锁定邮箱 15 分钟；IP 滑动窗口）。会话、验证码、令牌、限速计数等临时状态按设计放在内存——重启即失效，用户重新认证即可。

服务注册为 `ctx.userAccounts`。空库首次启动时强制先创建 owner，其余 Web 表面才可访问；`owner` 角色不可禁用、删除或降级（最后 owner 保护）。`allowRegistration`（默认 false）控制开放注册；管理员创建的账户不受此开关限制。

## Web 认证门

`./gate` 子路径插件在 Web 表面挂载认证门：未认证流量重定向到 `/login`（302），`/login`、`/register`、`/forgot`、`/reset`、`/api/auth/*` 与静态资源保持公开；登出、改密、禁用、删除都会立即失效会话。门席位在 webserver 上（`registerGate`）——单席位、由账户层持有，组合不会留下漏洞。

## 管理端点

`/api/admin/users/*`（list、reset-password、set-disabled、delete、set-role）需要 owner 或 admin 会话；最后 owner 保护会阻止禁用、删除或降级最后的 owner。owner 创建经首次启动的 `/api/auth/setup` 完成。

## SMTP 凭证

邮件发送由 email seam 的 QQ SMTP transport 提供；SMTP 凭证经凭证引用 `SMTP_USER` / `SMTP_PASS` 解析——绝不来自 cordis.yml 或代码。

## 密码哈希

argon2id，OWASP 基线参数（64 MB 内存、2 次迭代、并行度 1）。哈希绝不离开存储模块；视图不含哈希。

## Model Experience

无，本包仅存储与验证账户；不贡献任何提示词内容、工具或会话事件。

#### KV Cache effect

无；账户状态不会进入任何模型请求。

## Known Limitations and Deferred Work

- **临时状态存于内存** — 会话、验证码与重置令牌在重启后失效；用户需重新认证。
- **单节点存储** — SQLite 用户表绑定单个 harness home；多节点部署需要共享存储。
- **无 MFA / OAuth** — 仅支持密码登录；社交登录与多因素认证暂缓。
