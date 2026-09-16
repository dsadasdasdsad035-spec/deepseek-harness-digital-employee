# Design: digital-employee-skill-visibility

## Context

数字员工的技能由 `digital-employee-agent.compose()` 挂载：`skills.restrict({ allow: employee.authority.skills })` 把技能注册表收窄到授权集合（`packages/core/digital-employee-agent/src/index.ts:677`），随后 `tools.restrict({ allow: [...authority.tools, ...hookToolNames, ...workflowToolNames] })`（同文件 678 行）把工具收窄到业务工具白名单。

技能进入模型视野的唯一通道是 `tool-skill` 插件：它注册 `skill` 加载工具，并在每个 `agent/pre-step` 里，**仅当该 agent 解析到的 `skill` 工具就是本插件注册的那个**时，才把技能目录作为一条 `skill-catalog` 来源的用户消息注入（`packages/skill/tool-skill/src/index.ts:238-246`）。其源码注释把这条门写成有意设计：「a restriction or scoped same-name shadow therefore removes both the schema and its call guidance」。

两条成因叠加，导致技能对模型恒不可见：

1. **元工具被业务白名单裁掉**：员工 `authority.tools` 列的是 `project_board` 这类业务工具，不含 `skill`；`tools.restrict` 一执行，`ctx.tools.get('skill', agent)` 就不再等于本插件注册项 → 目录判定为空。单聊与群成员会话共用同一 `compose()`，两条路径同时失效。
2. **部分员工 preset 未挂加载体**：如 `project-manager-test` preset 只挂技能**定义**与工具定义（`apps/cli/config/agent-presets/project-manager-test/agent.cordis.yml`），未挂 `tool-skill`；这类员工即使不被 restrict 也无目录可注入。

实测证据（无鉴权实例 + 真实模型，见 Agent Note）：群成员与单聊会话的注入消息均无 `available_skills`；声明漫画技能的实例自称项目经理并报出 PMP/WBS 等技能（指令幻觉）；对照工具层真实隔离成立（一方调用 `project_board` 得真实数据，另一方明确回答「我没有这个工具」）。

## Goals / Non-Goals

**Goals:**

- 员工授权技能对其模型可见、可按名加载，且严格等于授权集合。
- 修复落在能力组装层，不改变 `restrict` 的隔离语义（越权技能仍不可见、不可加载）。
- 单聊与群会话路径同时受益。

**Non-Goals:**

- 不改技能定义、模板、实例数据本身；不动工作台发布流程。
- 不改变「工具按声明裁剪」的行为（业务工具仍按 `authority.tools` 严格限制）。
- 不新增会话事件类型（技能目录沿用既有 `skill-catalog` 来源消息）。

## Decisions

### D1: 技能对模型可见 = 保留元能力工具穿过业务工具裁剪（方案 A），而非把技能渲染进系统提示（方案 B）

- **A（选用）**：员工组装时，业务工具白名单之外始终保留提供技能目录的元能力工具。技能目录机制原样复用：`skills.restrict({ allow: authority.skills })` 已经保证目录内容等于授权集合，元工具可见后目录即正确。改动集中在 `compose()` 的工具裁剪（放行元能力工具）与 `tool-skill` 的可见性门（识别「业务工具被裁」与「元工具被裁」的区别）。
- **B（否决）**：把 `authority.skills` 渲染成系统提示的一节（像 identity/personality）。显式但重复了技能目录已有的投影逻辑，且丢掉了按需加载（目录只给摘要、加载才注入全文）的信息节制；技能内容变更时还需第二处同步。
- **C（否决）**：让目录独立于工具可见性。会破坏 `tool-skill` 现有契约（目录与加载器同生共死，避免出现「看得到但点不动」的清单），并在越权场景下泄漏技能名。

### D2: 识别「元能力工具」由技能能力缝自身声明，不在员工插件里写死名字

`compose()` 需要知道哪些工具必须穿过业务白名单。写死 `'skill'` 字符串会把员工插件耦合到一个具体插件的工具名；应由技能能力缝导出「本缝的元能力工具名」或让元工具注册时标记为不受业务裁剪。员工插件只消费该声明。备选：在员工插件内维护一个 `META_TOOLS` 常量——简单但每加一个能力缝就漏一处，否决。

### D3: preset 技能声明与加载体不一致时组合期失败

若员工 preset 声明了技能却未挂目录/加载器，属配置错误。按仓库「Misconfiguration fails loud」约定，在组合期失败并给出缺哪个插件的诊断，而不是静默产出「声明了技能但模型看不到」的员工。备选：容忍并降级——正是当前缺陷的成因，否决。

## Risks / Trade-offs

- [元工具可见后，员工能加载到未授权技能] → 目录内容由 `skills.restrict({ allow: authority.skills })` 决定，加载走同一限制；补越权场景测试锁定。
- [放宽工具裁剪被误解为放宽授权] → D2 的声明只标示「元能力工具」，业务工具仍严格按 `authority.tools` 裁剪；规格里写明该边界。
- [`tool-skill` 可见性门改动影响非员工会话] → 门只新增「元工具被显式裁剪」这一判别维度，普通会话行为不变（其 `skill` 工具本就未被裁）。
- [员工 preset 校验新增失败点，可能让既有部署启动即失败] → 属预期：这些 preset 本就没声明技能或本应挂加载体；失败信息指向具体 preset 与插件。

## Migration Plan

预发布期无兼容承诺，一次性切换。部署后：既有员工（含 preset 未挂载体者）若声明了技能，启动时按 D3 失败并指明修复点；未声明技能者不受影响。回滚 = 回退提交。

## Open Questions

- 元能力工具的声明形态（能力缝导出工具名 vs 注册期打标）属实现细节，两种都能满足规格，实现时按最小改动定。
- 是否需要在群成员会话首次投递前额外预热目录（当前由 pre-step 注入，天然在首回合前）——实现时以测试确认。
