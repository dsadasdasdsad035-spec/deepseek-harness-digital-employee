---
name: requesting-code-review
description: 在完成任务、实现主要功能或合并前验证工作是否满足需求时使用
---

# 请求代码审查

在问题级联之前派遣代码审查子代理捕获问题。

**核心原则：** 早审查，常审查。

## 何时请求审查

**强制：**
- 子代理驱动开发中每个任务后
- 完成主要功能后
- 合并到 main 之前

**可选但有价值：**
- 卡住时（新视角）
- 重构前（基线检查）
- 修复复杂 bug 后

## 如何请求

**1. 获取 git SHA：**
```bash
BASE_SHA=$(git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)
```

**2. 派遣代码审查子代理：**

使用 Task 工具，填写 `code-reviewer.md` 中的模板

**占位符：**
- `{WHAT_WAS_IMPLEMENTED}` — 你刚构建的内容
- `{PLAN_OR_REQUIREMENTS}` — 它应该做什么
- `{BASE_SHA}` — 起始提交
- `{HEAD_SHA}` — 结束提交

**3. 处理反馈：**
- 立即修复关键问题
- 继续前修复重要问题
- 记录次要问题供以后处理

## 警示信号

**永远不要：**
- 因为"很简单"就跳过审查
- 忽略关键问题
- 带着未修复的重要问题继续
