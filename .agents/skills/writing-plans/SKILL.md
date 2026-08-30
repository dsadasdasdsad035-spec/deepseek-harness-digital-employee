---
name: writing-plans
description: 当你有规格或多步骤任务的需求时使用，在接触代码之前
---

# 编写计划

## 概述

编写全面的实现计划，假设工程师对我们的代码库零了解、品味存疑。记录他们需要知道的一切：每个任务要修改哪些文件、代码、可能需要查看的测试和文档、如何测试。将整个计划分解为小任务。DRY、YAGNI、TDD、频繁提交。

**开始时宣布：** "我正在使用 writing-plans 技能创建实现计划。"

**保存计划到：** `docs/superpowers/plans/YYYY-MM-DD-<功能名>.md`

## 计划文档头部

**每个计划必须以此头部开始：**

```markdown
# [功能名] 实现计划

> **对于代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** [一句话描述构建内容]

**架构：** [2-3 句关于方法的描述]

**技术栈：** [关键技术/库]

---
```

## 任务结构

````markdown
### 任务 N：[组件名]

**文件：**
- 创建：`exact/path/to/file.py`
- 修改：`exact/path/to/existing.py:123-145`
- 测试：`tests/exact/path/to/test.py`

- [ ] **步骤 1：编写失败测试**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **步骤 2：运行测试验证其失败**

运行：`pytest tests/path/test.py::test_name -v`
预期：FAIL，提示"function not defined"

- [ ] **步骤 3：编写最小实现**

- [ ] **步骤 4：运行测试验证其通过**

- [ ] **步骤 5：提交**
````

## 禁止占位符

每个步骤必须包含工程师需要的实际内容。以下是**计划失败**——永远不要写：
- "TBD"、"TODO"、"稍后实现"、"填写细节"
- "添加适当的错误处理"/"添加验证"/"处理边缘情况"
- "为上述内容编写测试"（没有实际测试代码）
- "类似于任务 N"（重复代码——工程师可能乱序阅读任务）

## 执行交接

保存计划后，提供执行选择：

**"计划已完成并保存到 `docs/superpowers/plans/<文件名>.md`。两种执行选项：**

**1. 子代理驱动（推荐）** - 每个任务派遣新子代理，任务间审查，快速迭代

**2. 内联执行** - 在此会话中使用 executing-plans 执行任务，带检查点的批量执行

**你选择哪种方式？"**
