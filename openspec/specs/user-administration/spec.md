## Purpose

定义管理员用户后台：administrator 角色对用户账户的管理操作、owner 保护的边界与操作审计。

## Requirements

### Requirement: 用户管理操作

administrator 角色 SHALL 经管理 remote 执行：列出用户（email、角色、状态、创建时间）、创建用户（邮箱+初始密码）、重置密码（设定新密码并失效该用户全部会话）、禁用/启用、删除（含该用户全部会话失效）。全部操作 SHALL 经既有 administrator gate，未授权调用一律拒绝。

#### Scenario: 禁用用户即时生效

- **WHEN** 管理员禁用一个用户
- **THEN** 该用户既有会话立即失效，新登录被拒绝

#### Scenario: 未授权拒绝

- **WHEN** 非 administrator 会话调用用户管理 remote
- **THEN** 一律拒绝

### Requirement: owner 保护

系统 SHALL 保护最后一个 `owner`：不可禁用、不可删除、不可降级为其他角色；`owner` 角色仅可由其他 `owner` 授予。违反保护的操作 SHALL 以明确错误拒绝且无副作用。

#### Scenario: 最后 owner 保护

- **WHEN** 系统仅剩一个 owner 且管理员尝试禁用/删除/降级该账户
- **THEN** 操作被拒绝并提示至少保留一个 owner
