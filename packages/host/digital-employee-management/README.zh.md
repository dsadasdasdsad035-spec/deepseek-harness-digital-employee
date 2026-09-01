# @deepseek-ai/dsh-host-digital-employee-management

[English](README.md) | 中文

数字员工管理的类型化 Host gateway。`DigitalEmployeeManagementGateway` 发布为 `ctx.digitalEmployeeManagement`，并暴露 Typert Remote 命名空间 `digitalEmployees`；Cordis 服务键不同于已有 Definition 服务键 `ctx.digitalEmployees`，而 wire 命名空间保留公开领域名称。

## Remote 操作

该命名空间提供模板与实例检查；创建、激活、停用和删除生命周期操作；原子化员工聊天启动；记忆列出与删除；专家列出、继续、打断和任务树检查；审计历史；升级预览与应用；不含凭据的导出，以及导入为新的非活跃实例。

Remote 方法名在 `digitalEmployees` 内唯一，并直接描述管理操作：`listTemplates`、`list`、`get`、`create`、`activate`、`deactivate`、`delete`、`startChat`、`listMemory`、`deleteMemory`、`listExperts`、`taskTree`、`continueExpert`、`interruptExpert`、`listAudit`、`previewUpgrade`、`applyUpgrade`、`exportEmployee` 和 `importEmployee`。命名空间与方法名是 RPC 路径中不同的片段，可以使用相同的领域词汇。客户端命名空间实现成员采用专用于内部管理的名称，避免意外保留生成的业务方法名。

gateway 把所有权威操作委托给 `ctx.digitalEmployees`、`ctx.digitalEmployeeAgent` 与活跃 Agent 注册表。浏览器客户端不会重复实现生命周期、授权、任务归属、记忆、升级或导入验证。

`startChat` 接受调用方生成的 Session ID、一个提交身份，以及非空文本或编码图像。Host 在同一项操作中解析员工当前可用性、快照 `ctx.agentDefaultModel`、使用 Host 进程工作目录创建员工根 Agent、接纳附件，并排入标准的首条用户消息。重复同一提交会共享其已接受结果；使用不同任务数据复用该身份会被拒绝。验证、取消、附件接纳或首条消息失败时，Host 会 dispose 未发布的工作，不会返回可用的空员工 Session。

## 配置工作室

设置 `administrator: true` 可启用仅限本机管理员的模板配置操作。`studioFile` 指定保存可变草稿与发布溯源记录的私有用户 JSON 文件；相对路径相对于 Host 进程工作目录解析。gateway 在创建预览或发布版本时，会在该文件所在目录下实体化根指令与专家指令。

管理员使用 `createConfigurationDraft`、`updateConfigurationDraft`、`validateConfigurationDraft`、`previewConfigurationDraft`、`disposeConfigurationPreview`、`publishConfigurationDraft`、`listConfigurationDrafts` 和 `listConfigurationPublications`。验证会在预览或发布前解析 preset、Skill、Tool、MCP client、凭据引用、权限与委派要求。配置记录只包含凭据引用，不接受也不返回已解析的凭据值。

发布会分配不可变的本地版本，既有的 `listTemplates`、员工创建和 `previewUpgrade` 操作均可解析该版本。预览会创建隔离且带标记的 Session 与临时指令文件；dispose 后会同时删除两者，不会新增员工实例、记忆、导出内容或普通管理视图。本地发布版本中的长期记忆种子会在创建员工时提升为长期记忆。任一记忆种子被拒绝时，系统会回滚新员工，因此创建不会留下部分配置的实例。

## 模型体验

### 管理操作触发的工作

#### 模型看到的内容

`startChat` 创建员工 Agent 并提供其首条标准用户消息，`continueExpert` 则向已有专家提供下一条用户内容。员工 Consumer 负责所有提示词、工具与 Session 事件渲染。

#### Token 影响

gateway 不增加 token；请求内容只会通过所委托的员工或专家操作改变。

#### KV Cache 影响

gateway 不直接影响缓存。变化来自员工 Consumer 已记录的提示词投影。

## 已知限制与后续工作

- **仅提供 Remote 管理**：gateway 需要挂载 Definition、Provider、Agent Consumer 与活跃 Agent 服务；它本身不提供持久化或执行能力。
