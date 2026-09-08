# Agent Note: 账户系统（邮箱登录、首启引导、Web 认证门）

状态：已实现

[English](2026-09-09-account-system.md) | 中文

## 问题

Web 表面（3080）完全无用户概念：任何能访问端口的人都能操作员工、任务与会话。产品走向发布后收费，账号体系是收费地基。

## 决策

新增两个能力缝。`ctx.email`（packages/email/email）是通道注册表式邮件 seam：provider 注册纯文本 SMTP transport（内置 QQ SMTP：smtp.qq.com:465 SSL，密码为授权码），凭证经 `SMTP_USER`/`SMTP_PASS` 引用解析；send 永不 reject，未配置时 fail-visible 返回失败原因。`ctx.userAccounts`（packages/account/user-accounts）是 SQLite 用户存储：argon2id（OWASP 基线）、邮箱验证码（10 分钟单次）、重置令牌（15 分钟单次）、HMAC 签名会话 cookie、登录限速（5 次失败锁 15 分钟 + IP 窗口）。临时状态（会话/验证码/令牌/限速）按设计存内存——重启即失效，用户重新认证。

webserver 新增 `registerGate` 单席位（与 registerFallback 同型）：未认证流量一律 302 到 /login，放行清单集中在 gate 插件内。首启空库强制进入 /setup 创建 owner；`allowRegistration`（默认 false）控制开放注册；管理员后台端点按角色 gate，最后 owner 不可禁用/删除/降级。忘记密码有 SMTP 时走重置链接，未组合时退化为管理员重置——与通知缝同款 fail-visible。

## 已否决的备选方案

- **微信扫码自动授权个人机器人** —— 个人微信无官方机器人 API，协议 hack（wechaty 类）违反腾讯 ToS 且有封号风险；个人推送改走 Server酱式公众号通道更为稳妥（如需再立项）。
- **JSON 文件存用户** —— 密码字段安全敏感且需要唯一约束与并发写；SQLite 是 session-query 既有先例。
- **apiproxy RPC 层逐方法 gate** —— webserver registerGate 单席位在 HTTP 层一次拦截全部未认证流量，RPC 与页面共享同一放行清单，避免两份清单漂移。

## 后果

变更 employee-account-system 15/15 完成：email 缝 7 测试、账户服务 13 测试、gate HTTP 层 6 测试全绿；真实 3080 实例验证 首启建 owner → 登录 → 工作台 全链。临时状态存内存、单节点 SQLite 为已知边界；MFA/OAuth、多节点共享存储、配额计费（阶段 2/3）延后。
