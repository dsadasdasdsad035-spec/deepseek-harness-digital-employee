# Agent Note: Builder 数字员工

状态：已实现

[English](2026-09-05-builder-employee-template.md) | 中文

## 问题

创建数字员工需要在配置工作室中由管理员手动操作六种市场资产 kind，没有对话式的路径。

## 决策

Builder 数字员工模板将配置工作室 Remote 包装为六个作用域创作工具（`builder_list_assets`、`builder_create_draft`、`builder_validate_draft`、`builder_preview_draft`、`builder_publish_draft`）。三个专家（需求审查员、试跑测试员、打包员）分解访谈-编写-发布流程。工具仅在 Builder 组合中注册。

## 后果

Builder 在共享工作室中创建草稿并使用相同的校验；用户在发布前确认。zip 导出推迟到 `digital-employee-package-export` 变更。
