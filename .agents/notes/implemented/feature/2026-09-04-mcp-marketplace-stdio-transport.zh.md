# Agent Note: MCP 市场的 stdio 传输

状态：已实现

[English](2026-09-04-mcp-marketplace-stdio-transport.md) | 中文

## 问题

MCP 市场此前只接受声明式 Streamable HTTP 包，本地 MCP 服务器的发布者无法通过市场分发，且每个市场包都依赖远端 URL。Host 侧的挂载原语早已齐备（`dsh-mcp-client` 在清洗过的环境之上拉起 stdio 子进程；共享的归档、文件表与信任机制与传输无关），缺口完全落在描述符 schema、凭据模型和激活路径上。

## 决策

`mcpPackageDescriptorSchema` 将 `servers[]` 扩为按 `transport` 判别的联合；一个包可以混用 Streamable HTTP 与 stdio 服务。stdio 条目声明裸 `command`、`args`、固定 `env` 值和以环境变量名为域的 `credentialReferences`，载荷经由既有签名文件表分发。

本地执行安全在解析、安装和激活三处强制：`command` 必须是裸命令名（不含路径分隔符）且位于 Host 配置的 `stdioInterpreters` 白名单（默认 `['node']`，可验证的 `Config` 字段）；`args` 中所有含斜杠的条目必须是签名表中声明的文件，把脚本路径钉在已签名内容上并结构性阻断 `..` 与绝对路径；Host 在挂载时将 `cwd` 组合为受管包目录，签名因此与安装位置无关。

凭据引用语义从请求头推广到槽位：被凭据背书的请求头或环境变量必须携带空固定值，配置只持久化引用名，解析值只存在于挂载调用的 header 或 env 对象内。

任何 stdio 服务都会在解析结果中隐含 `subprocess` 权限 —— 构建器对归一化后的形态签名，披露因此是经签名的 schema 事实而非 UI 猜测。市场额外要求 stdio 包在安装或升级时携带一次显式 `confirmLocalExecution`：首次尝试以携带候选权限的 `local-execution-confirmation-required` 弹回，Web 客户端渲染披露弹窗，重试携带确认。stdio 包的升级把两次确认串联且不会循环。

激活将每个服务挂载在根上下文而非网关的服务上下文：服务上下文不在 `tools` 服务解析链上，在那里挂载的 fiber 注册不了任何工具。这是既有 Streamable HTTP 路径的潜伏缺陷（测试 mock 了挂载调用），现在对两种传输同时修复。

市场的模板声明扩展为员工模板的 MCP 声明联合（stdio 条目携带 `command`、`args`、`env`、`envCredentials`、`cwd`），digital-employee 侧此前已端到端支持该联合。

## 备选方案

- **独立的 `mcp-stdio` 包类型**：为无行为差异的场景复制签名、信任与生命周期机制；传输联合让两类服务共处一个签名描述符。
- **自由字符串 `command`**：每个已安装包都变成任意二进制执行；裸名语法加解释器白名单把可执行面收敛为"在 Host 批准的解释器下运行已签名包代码"。
- **只做解析期权限推断、不加确认门**：披露只在安装后可见；弹回重试流程把确认放在任何 stdio 包发布进受管目录之前。
- **对固定 env 值做密钥嗅探**：凭据背书槽位的空固定值规则已覆盖真实泄漏路径；请求头与环境变量槽位共享该规则。

## 后果

完全本地、可离线的 MCP 工具能通过市场分发，携带凭据的 stdio 服务永不持久化解析值。需要 `node` 之外解释器的部署通过 cordis.yml 扩展 `stdioInterpreters`。安装、升级、配置与卸载仍然重启生效；解释器跌出白名单的 stdio 包会以明确的逐包诊断呈现而非挂载。随包发布的模板现在是混合传输，因此每次模板安装都会在测试中走过本地执行确认路径。捆绑的 Python 运行时是否进入默认白名单仍待定；机制上无需 schema 变更即可支持。
