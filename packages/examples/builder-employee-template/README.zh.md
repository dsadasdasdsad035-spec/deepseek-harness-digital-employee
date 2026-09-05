# `@deepseek-ai/dsh-builder-employee-template`

[English](README.md) | 中文

Builder 数字员工：通过访谈帮助用户从已安装市场资产组装新的数字员工。

## 创作工具

六个工具包装配置工作室 Remote，仅在 Builder 组合中注册：`builder_list_assets`、`builder_create_draft`、`builder_validate_draft`、`builder_preview_draft`、`builder_publish_draft`。

## 专家

需求审查员、试跑测试员、打包员分解访谈-编写-发布流程。

## Model Experience

### 创作工具

#### 模型看到的内容

Builder 看到六个 `builder_*` 工具用于列出资产和驱动草稿生命周期。其他员工看不到它们。

#### Token effect

六个简短的工具 schema，在 Builder 模板不变时保持稳定。

#### KV Cache effect

无失效；工具是常量。
