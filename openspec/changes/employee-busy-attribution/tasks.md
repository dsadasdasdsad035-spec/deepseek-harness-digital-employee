## 1. 修复审计取 Agent

- [x] 1.1 `installAudit`（`digital-employee-agent`）改用属性直读取得当前 Agent（`agentCtx.agent`），替换 `agentCtx.get('agent')`
- [x] 1.2 取不到 Agent 时不再静默返回：改为可观测诊断（组合路径按设计选择显式失败或告警）
- [x] 1.3 核对专家组合路径（`composeExpertMcp`）的审计安装同样正确取到 Agent

## 2. 包级测试锁定回归

- [x] 2.1 新增测试：员工根任务 `createTask` 组合后 `appendAudit` 被调用，且记录含 employeeId / sessionId / agentId
- [x] 2.2 新增测试：`resumeTask` 恢复路径同样写入能力配置审计
- [x] 2.3 新增测试：Agent 作用域以「作用域属性」而非注册服务暴露时必须能取到（用裸 `extend({ agent })` 形如真实 agent-loop，而非 `provide('agent')`）
- [x] 2.4 专家组合既有审计测试保持通过

## 3. 端到端验证

- [x] 3.1 真实服务验证：`@员工` 后其 `companyFloor` 的 `busy` 在成员会话运行期间翻为 true，会话结束后转 false
- [x] 3.2 真实服务验证：`employees.json` 的 `audits` 开始增长且含成员会话的 sessionId
- [x] 3.3 刷新/重启后仍正确（持久化审计可反查）
- [x] 3.4 内部场景呈现（亮屏、"在忙"标签、回工位）随 busy 翻转；keyless 组装快照或既有 3D 快照按需刷新

## 4. 文档

- [x] 4.1 更新受影响 README（`digital-employee-agent` 审计契约、`company-management` busy 派生依赖审计）与 JSDoc
- [x] 4.2 撰写 Agent Note：静默断链的成因（属性 vs 服务）、为何单测假绿、以及 busy 恢复链路
