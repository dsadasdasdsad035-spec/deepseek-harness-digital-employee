# digital-employee-skill-visibility

## Why

数字员工模板可以声明 `capabilities.skills`，员工组装时也确实把技能注册表限制到这批技能（`skills.restrict({ allow: authority.skills })`）——但**模型从来收不到这份清单**。技能进入模型视野的唯一通道是 skill 目录加载体（`tool-skill` 插件），而该插件有一条硬门（`tool-skill/src/index.ts:238`）：

```ts
const toolVisible = ctx.tools.get(skillTool.name, agent) === skillTool
const snapshot = toolVisible ? await ctx.skills.snapshot(...) : { skills: [], complete: true }
```

员工组装紧接着把工具限制到业务工具白名单（`tools.restrict({ allow: authority.tools })`），`skill` 这个元工具不在其中，于是 `toolVisible=false`、目录恒为空。

实测（无鉴权实例 + 真实模型）：
- 群成员会话与员工单聊会话的注入消息里**均无** `available_skills`；
- 「小明」实例声明的技能是漫画类，却自称「项目经理小明」并报出 PMP/WBS 等项目管理技能——技能是**从指令文本幻觉出来的**，不是真实能力；
- 对照：**工具**是真实隔离的（「项目经理」调用 `project_board` 拿到真实项目数据，「小明」明确回答「我没有这个工具」）。

叠加第二处成因：部分员工 preset（如 `project-manager-test`）只挂技能**定义**，未挂目录/加载器插件，即使不被 restrict 也无目录可注入。

结果：员工「介绍自己的技能」不可信，群会话里「不同员工技能不同」无法作为可验证事实呈现。

## What Changes

- 数字员工的授权技能 SHALL 进入模型视野（可列出、可加载），且 SHALL 只含该员工授权范围内的技能。
- 元能力工具（`skill` 目录/加载器）SHALL 不受员工业务工具白名单裁剪；员工授权调整只约束业务工具。
- 员工 preset 若声明技能，SHALL 同时具备技能目录加载体（缺失时组合期失败，而非静默无目录）。
- 保持在 restrict 语义下的能力隔离：员工看不到、也加载不了任何越权技能。

## Capabilities

### Modified Capabilities

- `digital-employee-capabilities`: 该能力已要求「员工可使用声明的技能」，但未要求「技能对模型可见/可加载」。本变更补上可见性与加载性要求，并写明元能力工具不受业务工具裁剪。

## Impact

- `packages/core/digital-employee-agent`：`compose()` 的工具限制需保留元能力工具（或改为把授权技能渲染进系统提示）。
- `packages/skill/tool-skill`：目录可见性门可能需要区分「业务工具被裁」与「元工具被裁」。
- `apps/cli/config/agent-presets/*`：员工 preset 的技能挂载完整性。
- 会话事件面：技能目录是既有 `skill-catalog` 来源消息，不新增事件类型。
- 单聊与群会话两条路径同时受益（同一 `compose()`）。
