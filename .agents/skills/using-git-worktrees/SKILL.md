---
name: using-git-worktrees
description: 在开始需要与当前工作区隔离的功能工作时，或在执行实现计划之前使用——创建带有智能目录选择和安全验证的隔离 git 工作树
---

# 使用 Git 工作树

## 概述

Git 工作树创建共享同一仓库的隔离工作区，允许同时在多个分支上工作而无需切换。

**核心原则：** 系统化目录选择 + 安全验证 = 可靠隔离。

**开始时宣布：** "我正在使用 using-git-worktrees 技能设置隔离工作区。"

## 目录选择流程

按此优先顺序：

1. **检查现有目录**
```bash
ls -d .worktrees 2>/dev/null
ls -d worktrees 2>/dev/null
```
如果找到：使用该目录。两者都存在时，`.worktrees` 优先。

2. **检查 CLAUDE.md**
```bash
grep -i "worktree.*director" CLAUDE.md 2>/dev/null
```
如果指定了偏好：直接使用，无需询问。

3. **询问用户**（如果没有目录且没有 CLAUDE.md 偏好）

## 安全验证

对于项目本地目录，**必须在创建工作树之前验证目录已被忽略：**

```bash
git check-ignore -q .worktrees 2>/dev/null
```

**如果未被忽略：** 添加到 .gitignore，提交变更，然后继续。

## 创建步骤

```bash
# 创建工作树
git worktree add "$path" -b "$BRANCH_NAME"

# 运行项目设置（自动检测）
if [ -f package.json ]; then npm install; fi
if [ -f Cargo.toml ]; then cargo build; fi

# 验证干净基线
npm test  # 或适合项目的命令
```

如果测试失败：报告失败，询问是否继续。

## 警示信号

**永远不要：**
- 不验证忽略就创建工作树（项目本地）
- 跳过基线测试验证
- 测试失败时不询问就继续

## 集成

**被以下调用：**
- **brainstorming** — 设计批准后必需
- **subagent-driven-development** — 执行任何任务前必需
- **executing-plans** — 执行任何任务前必需

**配合使用：**
- **finishing-a-development-branch** — 工作完成后清理
