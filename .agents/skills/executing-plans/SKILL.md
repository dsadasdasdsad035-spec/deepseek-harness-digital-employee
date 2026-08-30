---
name: executing-plans
description: 当你有书面实现计划需要在独立会话中执行并带有审查检查点时使用
---

# 执行计划

## 概述

加载计划，批判性审查，执行所有任务，完成后报告。

**开始时宣布：** "我正在使用 executing-plans 技能来实现此计划。"

**注意：** 告诉你的人类伙伴，Superpowers 在有子代理访问权限时效果更好。如果子代理可用，请使用 superpowers:subagent-driven-development 而不是此技能。

## 流程

### 第一步：加载并审查计划
1. 读取计划文件
2. 批判性审查——识别任何问题或疑虑
3. 如有疑虑：在开始前与人类伙伴提出
4. 如无疑虑：创建 TodoWrite 并继续

### 第二步：执行任务

对于每个任务：
1. 标记为进行中
2. 严格按照每个步骤执行
3. 按规定运行验证
4. 标记为已完成

### 第三步：完成开发

所有任务完成并验证后：
- 宣布："我正在使用 finishing-a-development-branch 技能完成此工作。"
- **必需子技能：** 使用 superpowers:finishing-a-development-branch

## 何时停止并寻求帮助

**立即停止执行，当：**
- 遇到阻碍（缺少依赖、测试失败、指令不清）
- 计划有关键缺口无法开始
- 你不理解某条指令
- 验证反复失败

**寻求澄清而不是猜测。**

## 集成

**必需工作流技能：**
- **superpowers:using-git-worktrees** — 必需：开始前设置隔离工作区
- **superpowers:finishing-a-development-branch** — 所有任务完成后完成开发
