---
name: subagent-driven-development
description: 在当前会话中执行带有独立任务的实现计划时使用
---

# 子代理驱动开发

每个任务派遣新子代理执行，之后进行两阶段审查：先规格合规审查，再代码质量审查。

**核心原则：** 每个任务一个新子代理 + 两阶段审查（规格然后质量）= 高质量、快速迭代

## 流程

1. 读取计划，提取所有任务的完整文本，创建 TodoWrite
2. 对每个任务：
   - 派遣实现子代理（`./implementer-prompt.md`）
   - 如果子代理提问：回答后重新派遣
   - 子代理实现、测试、提交、自审
   - 派遣规格审查子代理（`./spec-reviewer-prompt.md`）
   - 如果规格不合规：子代理修复，重新审查
   - 派遣代码质量审查子代理（`./code-quality-reviewer-prompt.md`）
   - 如果质量不通过：子代理修复，重新审查
   - 标记任务完成
3. 所有任务完成后：派遣最终代码审查子代理
4. 使用 superpowers:finishing-a-development-branch

## 处理实现者状态

- **DONE：** 继续规格合规审查
- **DONE_WITH_CONCERNS：** 阅读疑虑后再继续
- **NEEDS_CONTEXT：** 提供缺失上下文并重新派遣
- **BLOCKED：** 评估阻碍——提供更多上下文、换更强模型、拆分任务，或上报给人类

**永远不要** 忽略上报或强迫同一模型不做任何改变地重试。

## 警示信号

**永远不要：**
- 在未经用户明确同意的情况下在 main/master 分支上开始实现
- 跳过审查（规格合规或代码质量）
- 并行派遣多个实现子代理（会产生冲突）
- 让子代理读取计划文件（提供完整文本代替）
- 在规格合规通过 ✅ 之前开始代码质量审查

## 集成

**必需工作流技能：**
- **superpowers:using-git-worktrees** — 必需：开始前设置隔离工作区
- **superpowers:finishing-a-development-branch** — 所有任务完成后完成开发
