# 数字员工聊天提及实现计划

[English](2026-08-29-digital-employee-chat-mentions.md) | 中文

> **对于代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 让用户在新任务聊天输入框中通过结构化 `@数字员工` 创建员工专属根会话，并把正文作为首条用户消息可靠提交。

**架构：** `ui-digital-employees` 向通用输入触发与引用系统贡献员工选择和路由提交能力，`ui-conversation` 只处理类型化的路由声明。Host 通过一个原子任务启动操作校验员工、解析组合、创建根 Agent、记录员工所有权并接收首条消息，成功后 Web 才选择新 Session。

**技术栈：** TypeScript ESM、Cordis plugins、Typert Remote RPC、React、Vitest、Playwright、Session event log、TypeScript/Python SDK projections。

---

### 任务 1：固定员工根会话的持久身份

**文件：**
- 修改：`packages/core/digital-employee/src/types.ts`
- 修改：`packages/core/digital-employee-agent/src/index.ts`
- 修改：`packages/core/digital-employee-agent/tests/digital-employee-agent.spec.ts`
- 修改：`packages/core/session/src/known-event-types.ts`
- 修改：`packages/sdk/protocol/src/types.ts`
- 修改：`packages/sdk/protocol/tests/transport.spec.ts`
- 修改：`packages/sdk/client/tests/sdk-client.spec.ts`
- 修改：`python/sdk/tests/test_client.py`

- [ ] **步骤 1：编写失败测试**

在数字员工 Agent 测试中断言根 Session 写入一个必需身份事件，并包含稳定实例、模板和组合标识：

```text
expect(events).toContainEqual(expect.objectContaining({
  type: 'digital-employee/identity',
  data: expect.objectContaining({
    employeeId,
    templateId: 'operations-coordinator',
    templateVersion: '2.0.0',
    compositionId: expect.any(String),
  }),
}))
```

补充恢复测试，修改实例显示名称后仍从事件重建创建时的员工归属。

- [ ] **步骤 2：运行测试并验证失败**

运行：

```sh
source ~/.nvm/nvm.sh && nvm use 22
pnpm exec vitest run packages/core/digital-employee-agent/tests/digital-employee-agent.spec.ts
```

预期：身份事件缺少 `compositionId`，恢复投影尚不能提供完整所有权。

- [ ] **步骤 3：实现最小持久身份**

为解析后的员工组合生成稳定的组合标识，将完整创建时身份写入 `digital-employee/identity`。更新 `SessionEventMap` 声明和已知事件清单，不通过当前员工名称或注册表反查历史归属。

- [ ] **步骤 4：更新双 SDK 投影**

更新 TypeScript 协议与客户端期望，以及 Python SDK 的同等事件输出。若事件数据本身是新增成员而非日志结构变化，保持现有 Session 格式版本。

- [ ] **步骤 5：运行聚焦验证**

```sh
pnpm exec vitest run \
  packages/core/digital-employee-agent/tests/digital-employee-agent.spec.ts \
  packages/sdk/protocol/tests/transport.spec.ts \
  packages/sdk/client/tests/sdk-client.spec.ts
pnpm --dir python/sdk test
```

- [ ] **步骤 6：提交**

```sh
git add packages/core/digital-employee packages/core/digital-employee-agent packages/core/session packages/sdk python/sdk
git commit -m "feat(digital-employee): persist root ownership"
```

### 任务 2：实现原子首任务启动

**文件：**
- 修改：`packages/core/digital-employee-agent/src/index.ts`
- 修改：`packages/core/digital-employee-agent/tests/digital-employee-agent.spec.ts`
- 修改：`packages/host/digital-employee-management/src/types.ts`
- 修改：`packages/host/digital-employee-management/src/index.ts`
- 修改：`packages/host/digital-employee-management/tests/gateway.spec.ts`
- 修改：`packages/host/digital-employee-management/tests/typert-generation.spec.ts`

- [ ] **步骤 1：为 Host 行为编写失败测试**

覆盖成功、员工停用、模板缺失、空任务、重复 `submissionId` 和消息接收失败清理：

```text
const result = await gateway.startChat({
  employeeId,
  sessionId,
  submissionId,
  content: [{ type: 'text', text: '检查发布计划' }],
})

expect(result).toEqual({ sessionId })
expect(agent.followup).toHaveBeenCalledTimes(1)
```

失败用例断言 `agents.get(sessionId)` 不返回已发布的空 Agent。

- [ ] **步骤 2：运行测试并验证失败**

```sh
pnpm exec vitest run \
  packages/core/digital-employee-agent/tests/digital-employee-agent.spec.ts \
  packages/host/digital-employee-management/tests/gateway.spec.ts
```

预期：`startChat` 尚不存在，当前 `runTask` 不接收首条内容。

- [ ] **步骤 3：定义请求与结果类型**

请求包含 `employeeId`、`sessionId`、品牌化 `submissionId`、`ContentBlock[]`、现有附件表达和可选取消信号。结果只在首条消息被接受后返回 Session ID。

- [ ] **步骤 4：实现受控启动生命周期**

在拥有 Agent 创建的服务中顺序完成员工解析、组合、Agent 创建和标准 `followup` 接收。为尚未发布成功的 handle 注册清理；任何失败都调用 `dispose()` 并清除提交去重状态。

- [ ] **步骤 5：更新 Remote 方法**

用不与 namespace service 冲突的 `startChat` 替代空 `runTask` 路径，更新 Typert Host 与 client 生成期望。

- [ ] **步骤 6：运行聚焦验证并提交**

```sh
pnpm exec vitest run \
  packages/core/digital-employee-agent/tests/digital-employee-agent.spec.ts \
  packages/host/digital-employee-management/tests/gateway.spec.ts \
  packages/host/digital-employee-management/tests/typert-generation.spec.ts
git add packages/core/digital-employee-agent packages/host/digital-employee-management
git commit -m "feat(digital-employee): start chats atomically"
```

### 任务 3：给通用输入系统增加路由引用

**文件：**
- 修改：`packages/client/ui-input-trigger/src/core/contract.ts`
- 修改：`packages/client/ui-input-trigger/src/client/contract.ts`
- 修改：`packages/client/ui-input-trigger/src/client/controller.ts`
- 修改：`packages/client/ui-input-trigger/tests/service.client.spec.ts`
- 修改：`packages/client/ui-conversation/src/client/input/contract.ts`
- 修改：`packages/client/ui-conversation/src/client/input/machine.ts`
- 修改：`packages/client/ui-conversation/src/client/input/facade.ts`
- 修改：`packages/client/ui-conversation/tests/input-reference-submit.client.spec.ts`
- 修改：`packages/client/ui-conversation/tests/input-machine.client.spec.ts`

- [ ] **步骤 1：编写路由引用失败测试**

插入位于首位置的 routing occurrence，断言提交交给 owner 且正文不包含显示 token：

```text
expect(routeSubmit).toHaveBeenCalledWith(
  expect.objectContaining({ ref: employeeId, body: '检查发布计划' }),
)
expect(defaultSink).not.toHaveBeenCalled()
```

覆盖第二个员工、正文之后的员工、删除 token、撤销/重做和 owner 失效。

- [ ] **步骤 2：运行测试并验证失败**

```sh
pnpm exec vitest run \
  packages/client/ui-input-trigger/tests/service.client.spec.ts \
  packages/client/ui-conversation/tests/input-reference-submit.client.spec.ts \
  packages/client/ui-conversation/tests/input-machine.client.spec.ts
```

- [ ] **步骤 3：扩展类型化提交声明**

为引用 owner 增加明确的 model serialization 或 route submission 类型。输入机只维护通用 occurrence 与位置规则；员工目录和 Remote 调用不进入 `ui-conversation`。

- [ ] **步骤 4：保持提交事务语义**

路由提交复用 `SubmitAttempt`、AbortSignal、图片保留和 `submit-settled`。成功才消费正文、routing occurrence 和附件，失败则完整保留。

- [ ] **步骤 5：运行输入测试并提交**

```sh
pnpm exec vitest run packages/client/ui-input-trigger/tests packages/client/ui-conversation/tests/input-reference-submit.client.spec.ts packages/client/ui-conversation/tests/input-machine.client.spec.ts
git add packages/client/ui-input-trigger packages/client/ui-conversation
git commit -m "feat(conversation): support routed composer references"
```

### 任务 4：注册数字员工提及与聊天导航

**文件：**
- 修改：`packages/client/ui-digital-employees/src/client/store.ts`
- 修改：`packages/client/ui-digital-employees/src/client/index.ts`
- 修改：`packages/client/ui-digital-employees/src/client/DigitalEmployeeWorkspace.tsx`
- 修改：`packages/client/ui-digital-employees/src/client/DigitalEmployeeWorkspace.module.css`
- 修改：`packages/client/ui-digital-employees/tests/store.client.spec.ts`
- 修改：`packages/client/ui-digital-employees/tests/components.client.spec.tsx`
- 修改：`packages/client/ui-digital-employees/tests/apply.client.spec.ts`

- [ ] **步骤 1：编写员工提及失败测试**

断言 `@` 目录包含已激活员工，停用或模板缺失员工不可选，并以稳定实例 ID 插入引用：

```text
expect(rows).toContainEqual(expect.objectContaining({
  ref: employeeId,
  label: '运营协调员',
  disabled: false,
}))
```

成功提交断言 Sessions 服务选择返回的 Session；失败断言草稿和附件仍在。

- [ ] **步骤 2：运行测试并验证失败**

```sh
pnpm exec vitest run packages/client/ui-digital-employees/tests
```

- [ ] **步骤 3：注册提及来源**

由数字员工插件贡献触发检测、菜单行、结构化插入、实时有效性和 routed submit。菜单显示员工名称、模板及不可用原因，不在通用输入包硬编码数字员工文案。

- [ ] **步骤 4：统一管理页入口**

将 `Run task` 改为 `Start chat`。通过共享导航服务打开独立新任务入口并预插入员工引用，不覆盖用户当前非空草稿，也不提前创建 Session。

- [ ] **步骤 5：运行组件测试并提交**

```sh
pnpm exec vitest run packages/client/ui-digital-employees/tests
git add packages/client/ui-digital-employees
git commit -m "feat(digital-employee-ui): add chat mentions"
```

### 任务 5：装配 Remote 与 Web 应用

**文件：**
- 修改：`packages/api/remotes/src/client/index.ts`
- 修改：`packages/api/remotes/tests/digital-employees.client.spec.ts`
- 修改：`packages/bundle/web-app/cordis.patch.yml`
- 修改：`packages/bundle/web-app/package.json`
- 修改：`packages/bundle/web-app/tests/digital-employee-composition.spec.ts`
- 修改：`packages/client/ui-digital-employees/package.json`
- 修改：`tsconfig.client.json`
- 修改：`tsconfig.host.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：编写装配失败测试**

断言 Remote 客户端只挂载一次 `digitalEmployees/startChat`，Web bundle 同时装配输入触发、数字员工 UI 和 Host Remote provider，并拒绝 namespace 方法冲突。

- [ ] **步骤 2：运行测试并验证失败**

```sh
pnpm exec vitest run \
  packages/api/remotes/tests/digital-employees.client.spec.ts \
  packages/bundle/web-app/tests/digital-employee-composition.spec.ts
```

- [ ] **步骤 3：更新 manifests 与 compiler faces**

补齐实际 source/runtime 依赖、Web `cordis.patch.yml` 顺序和 Host/Client Project References。运行 Typert 生成器更新生成物，不手工编辑生成文件。

- [ ] **步骤 4：运行构建烟测并提交**

```sh
pnpm exec vitest run packages/api/remotes/tests/digital-employees.client.spec.ts packages/bundle/web-app/tests/digital-employee-composition.spec.ts
pnpm run typecheck
pnpm run build
git add packages/api/remotes packages/bundle/web-app packages/client/ui-digital-employees tsconfig.client.json tsconfig.host.json pnpm-lock.yaml
git commit -m "feat(web): compose digital employee chat routing"
```

### 任务 6：添加真实用户路径覆盖

**文件：**
- 修改：`examples/headless-agent/tests/digital-employee.snapshot.ts`
- 修改：`examples/headless-agent/tests/fixtures/core/digital-employee-agent/driver.ts`
- 修改：`examples/headless-agent/tests/fixtures/core/digital-employee-agent/mock-llm.ts`
- 修改：`apps/web/tests/digital-employees.e2e.ts`

- [ ] **步骤 1：扩展 keyless fixture**

让 fixture 通过 `startChat` 接收首条用户任务，输出员工 ID、模板版本、专家委派和最终结果的稳定 transcript。

- [ ] **步骤 2：运行快照并确认预期差异**

```sh
pnpm run test:snapshot -- -t "digital employee"
```

预期：旧快照缺少首条任务和员工聊天入口证据。

- [ ] **步骤 3：实现 Web E2E**

测试从聊天输入 `@`、选择员工、输入任务、发送并切换到员工会话；再从管理页点击 `Start chat`，断言未提前产生空 Session。

- [ ] **步骤 4：运行真实组合测试**

```sh
pnpm run test:snapshot -- -t "digital employee"
pnpm exec playwright test apps/web/tests/digital-employees.e2e.ts
```

- [ ] **步骤 5：录制 GUI GIF 并提交**

按 `record-browser-gif` 工作流从本分支真实 Web server 录制聊天提及与管理页入口，保存并发布 PR 所需资产。

### 任务 7：文档、Agent Note 与最终验证

**文件：**
- 修改：`packages/core/digital-employee-agent/README.md`
- 修改：`packages/core/digital-employee-agent/README.zh.md`
- 修改：`packages/host/digital-employee-management/README.md`
- 修改：`packages/host/digital-employee-management/README.zh.md`
- 修改：`packages/client/ui-digital-employees/README.md`
- 修改：`packages/client/ui-digital-employees/README.zh.md`
- 修改：`docs/user/guide/digital-employees.md`
- 修改：`docs/user/guide/digital-employees.zh.md`
- 修改：`docs/architecture.md`
- 修改：`docs/architecture.zh.md`
- 修改：`docs/persistence-catalog.md`
- 创建：`.agents/notes/implemented/architecture/2026-08-29-digital-employee-chat-routing.md`
- 创建：`.agents/notes/implemented/architecture/2026-08-29-digital-employee-chat-routing.zh.md`

- [ ] **步骤 1：同步代码契约文档**

说明 `@数字员工` 只创建新的员工根会话、`Start chat` 不创建空 Session、Host 执行最终状态校验，以及历史会话保留创建时身份。

- [ ] **步骤 2：生成或更新文档元数据**

运行项目既有 i18n 和 persistence catalog 生成器，检查生成差异，不手工复制可能由生成器拥有的内容。

- [ ] **步骤 3：执行变更范围验证**

先调用 `dsh-pre-push-checks` 选择最小覆盖集，再运行其要求的命令；至少包括：

```sh
openspec validate add-digital-employee-chat-mentions --strict
pnpm run test:snapshot -- -t "digital employee"
pnpm run doc-sync
git diff --check
```

- [ ] **步骤 4：提交文档与验证证据**

```sh
git add .agents/notes packages/core/digital-employee-agent packages/host/digital-employee-management packages/client/ui-digital-employees docs examples apps/web openspec/changes/add-digital-employee-chat-mentions
git commit -m "docs(digital-employee): document chat mentions"
```
