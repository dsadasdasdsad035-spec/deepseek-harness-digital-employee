## Context

仓库现状：无用户概念（仅遥测匿名 UUID）；webserver 绑定本机、apiproxy 无认证前置；已有的安全基建可复用——storage SQLite（session-query-sqlite 先例）、credentials `set/unset/describe` 已有完整 Web RPC 面（Models 页在用）、administrator gate（management 网关）、`withFileLock` 原子写模式。产品走向发布后收费，账号体系是收费地基：本 change 只做账户地基（阶段 1），权益/支付为阶段 2/3。

新依赖：argon2（密码哈希标准，需原生编译——与既有 native 依赖同风险面）、nodemailer（SMTP 标准库）。

## Goals / Non-Goals

**Goals:**
- SQLite users 表：email（唯一索引）、passwordHash（argon2id）、role（owner/admin/user）、disabled、ownerId（预埋多租户，初始=自身 id）、createdAt
- 注册（邮箱验证码）、登录/登出（签名 cookie）、忘记密码（重置链接）、限速、防枚举
- email 缝（QQ SMTP provider）+ 未认证拦截 + 管理后台用户管理 remote 组
- 凭证引用：`SMTP_USER`/`SMTP_PASS`/`SESSION_SECRET` 全走 credentials 库；用户提供值实施时导入本机库

**Non-Goals:** 权益/配额/支付（阶段 2/3）；OAuth/MFA；ownerId 数据隔离的强制执行（字段预埋，隔离是阶段 2）；users 存储的多机共享。

## Decisions

### D1：users 表放 SQLite（storage-domain 已有 json/sqlite 双 backend）
新表挂 storage-domain 的 SQLite backend（session-query-sqlite 同模式）。不用 JSON：密码字段安全敏感且要求唯一约束/并发写，SQLite 是既有先例且终态（多租户）必然是 DB。`ownerId` 字段从第一天写入（值=自身 id），阶段 2 强制隔离时零迁移。

### D2：密码哈希 argon2id（native 依赖 argon2 npm 包）
参数取 OWASP 基线（memory 64MB、iterations 2、parallelism 1）。哈希串（含盐与参数）直接存列。登录比较用包内置 timing-safe verify。

### D3：会话 = 服务端随机 token 的 HMAC 签名 cookie
token = 随机 32 字节，库内存表（哈希后存储）+ 过期时间；cookie 值 = `token.signature`（SESSION_SECRET 经 credentials 引用解析，未配置时首启自动生成并写入凭据库）。HttpOnly + SameSite=Lax + Secure（HTTPS 时）。改密/禁用/删除 → 按 userId 删全部会话。服务端表放内存（重启全员重登——个人部署可接受，换取零迁移）。

### D4：验证码/重置 token = 内存单飞表
6 位验证码与重置 token 均为内存表（哈希存储、10/15 分钟 TTL、单次消费）。重启即失效 = 用户重新申请，可接受；避免为低频数据建表。

### D5：限速在账户服务内自实现
每邮箱失败计数（5 次/15 分钟锁）+ 每 IP 滑动窗口（60 次/分钟）。不引外部依赖；内存实现，重启清零可接受。

### D6：邮件缝 = `packages/email/email`，provider 形态同 notification
`ctx.email.send` 契约 + QQ SMTP provider 子路径插件。凭证引用 `SMTP_USER`/`SMTP_PASS`（QQ 邮箱：user=邮箱地址，pass=授权码），host/port 固定为 qq 语义放 provider 内（Config 可覆写）。未组合/未配置 → send 返回 `{delivered:false, reason}`，注册/重置路径相应降级（见 D5 spec 里注册页关/提示）。

### D7：认证拦截在 webserver（HTTP 层）+ apiproxy（RPC 层）双前置
HTTP：除放行清单（登录/注册/重置/验证码/静态/健康检查）外一律 302 登录页。RPC：除放行方法组外要求有效会话，账户身份注入调用上下文（administrator 判定沿用 management 既有 gate，由会话角色驱动）。放行清单集中一处声明，测试断言清单外全拒。

### D8：用户管理 remote 挂 management 网关（administrator gate 已在）
`listUsers/createUser/resetUserPassword/setUserDisabled/setUserRole/deleteUser` 六个 `@Remote`，typert 同步流程照旧。owner 保护在服务层实现。

### D9：注册页开关与 owner 引导
`allowRegistration`（默认 false——个人实例先关，SaaS 化再开）。首启 users 表空 → 强制 owner 创建页，绕过注册开关。

## Risks / Trade-offs

- [argon2 native 编译失败] → 与既有 node-addon 同风险；CI 矩阵覆盖；提供 bcrypt 纯 JS 后备不在本期（降级会降安全）。
- [会话内存表重启即失效] → 个人部署可接受；SaaS 化时迁 SQLite（表结构已按可迁移设计）。
- [邮件进垃圾箱/投递延迟] → 验证码 10 分钟 + 重发限速 60s；README 指引 QQ 邮箱授权码获取。
- [QQ SMTP 限流] → 验证码/重置均有限速兜底；高频场景属滥用。
- [明文授权码已出现在对话中] → 实施时导入本机凭据库后，建议用户在 QQ 邮箱重新生成授权码作废旧的（写进 tasks 交付项）。

## Migration Plan

纯新增。已有部署升级后：首访问进 owner 创建页（老用户即所有者本人），创建后其余用户经管理员创建。回滚 = 移除拦截层配置。

## Open Questions

- Secure cookie 标志需 HTTPS：LAN 明文部署时仅 HttpOnly+SameSite（spec 写条件式）。
- 邮件是否需要 HTML 模板（本期纯文本）。
