## 1. email 能力缝

- [x] 1.1 新包 `packages/email/email`：`ctx.email.send` 契约、QQ SMTP provider（nodemailer、凭证引用解析、有限重试、fail-visible）
- [x] 1.2 凭证导入：`SMTP_USER`/`SMTP_PASS` 写入本机 credentials 库 `refs:`（不落仓库）；单元测试用本地 SMTP 桩验证两态

## 2. user-accounts 缝

- [x] 2.1 SQLite users 表（email 唯一索引、argon2id、role、disabled、ownerId 预埋）+ 内存会话/验证码/token 表（node:sqlite，零原生编译）
- [x] 2.2 注册（验证码邮件、防枚举、allowRegistration）、登录/登出（通用错误、禁用拒绝、cookie 签发）、限速（5 次锁 15 分钟 + IP 窗口）
- [x] 2.3 忘记密码（重置链接单次 15 分钟、全会话失效、防枚举）+ argon2id 参数基线
- [x] 2.4 单元测试：注册/登录/重置/限速/防枚举全路径（临时库）

## 3. Web 拦截与页面

- [x] 3.1 webserver 未认证拦截 + 放行清单集中声明（清单外全拒的测试）
- [x] 3.2 登录/注册/忘记密码/重置/首启 owner 创建页面（中文 UI）
- [x] 3.3 认证 gate 坐席（webserver registerGate）+ 放行清单集中声明 + 全 RPC 拦截（会话 cookie）
- [x] 3.4 client 契约测试：拦截重定向、登录两态、owner 引导

## 4. 管理后台用户管理

- [x] 4.1 用户管理 API（实施偏差：以 gate 插件内 /api/admin/users/* HTTP 端点实现，行为与 @Remote 方案等价且免去 typert 同步；owner 保护与 administrator 校验在端点内）
- [x] 4.2 设置内用户管理区块（administrator 可见）+ client 契约测试
- [x] 4.3 host 单测：owner 保护矩阵、禁用即全会话失效、未授权拒绝

## 5. 端到端与门禁

- [x] 5.1 GUI 黑盒测试：注册→验证码→登录→忘记密码→管理操作全链（真实 3080 实例）
- [x] 5.2 README 双语 + Agent Note（双语配对）+ SMTP 授权码作废旧值的提醒
- [x] 5.3 门禁：typecheck/lint/hygiene/doc-sync 全绿；相关包测试与快照 replay 全绿
