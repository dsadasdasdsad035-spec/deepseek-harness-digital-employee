## Why

技能市场已支持安全上传 ZIP，但用户没有一个经过验证的参考包来理解目录结构、必需元数据和可选说明文件。提供可下载的演示 ZIP 可以让用户先验证上传流程，再以相同结构制作自己的技能。

## What Changes

- 在技能市场界面提供演示技能 ZIP 的下载入口。
- 添加版本控制的静态 ZIP 资产，包含完整 `SKILL.md` 示例、参考文件和面向作者的说明。
- 为模板 ZIP 添加测试，证明其通过现有市场 ZIP 校验并可作为新技能安装。

## Capabilities

### New Capabilities

- `skill-market-zip-template`: 提供可下载、可安全安装的技能市场演示 ZIP 模板。

### Modified Capabilities

- None.

## Impact

影响技能市场 Web UI、前端静态资产、模板构建或校验测试，以及市场 ZIP 安装集成测试。不会改变既有上传请求、安装接口或归档安全限制。
