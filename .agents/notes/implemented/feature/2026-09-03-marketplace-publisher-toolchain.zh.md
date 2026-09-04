# Agent Note: 市场发布者工具链

Status: implemented

[English](2026-09-03-marketplace-publisher-toolchain.md) | 中文

## Problem

Tool 与 MCP 市场包要求描述符由显式受信任的发布者签名，但唯一可用的签名实现只存在于测试 fixture 中。可下载的发布者模板携带占位符身份和签名值，发布者若不手写对序列化敏感的 Node 代码，就无法把分发出的模板变成可安装的包。

## Decision

`@deepseek-ai/dsh-marketplace-core` 在校验器旁边拥有生产者侧。`signMarketplacePackage()` 对内存中的描述符和精确文件清单签名；`buildMarketplacePackage()` 读取源目录，要求描述符的 `files` 键与目录内容完全一致，并委托给同一条签名路径。两者在返回字节前都会对自身输出重跑安装端共享的归档、描述符、文件表和签名检查，因此构建器接受与安装器接受不会漂移。

`dsh-market-package` bin 包装该构建器。它接收源目录、包类型、真实发布者 id，以及一个既有 Ed25519 私钥或生成密钥的请求（`0600`）。stdout 只输出由签名密钥派生的 `DSH_MARKET_TRUSTED_PUBLISHERS` JSON 数组；私钥字节绝不进入归档、信任记录或 stdout。

`--trust-file <path>` 会把输出的记录持久化到约定位置的 Harness home `market-publishers.json`：文件仅属主可写，记录按发布者 id 合并，同一 id 复用不同公钥会被拒绝。配置了 `trustedPublishersFile` 的市场网关在组合时合并文件与内联记录；文件格式错误、权限不安全或发布者 id 跨来源重复都会显式失败。`DSH_` 环境前缀保持 bootstrap-only，因此持久信任来源是该文件——而不是 `.env`。

源描述符中的签名值总是被替换、绝不被信任；占位符发布者身份仅在仍等于模板占位符时被拒绝。Tool 与 MCP 模板下载在各语言中标注为 “publisher template”，而免签名即可安装的 skill 模板保留 “example ZIP” 标签。

## Alternatives considered

- **发布预签名模板归档并自动信任内置 dev 发布者**：这会把 “受信任发布者” 变成常量，且 dev 信任路径有泄漏进非 dev 组合的风险；打印精确的信任值让回环只差一次显式 export。
- **把签名留在测试 fixture 或发布者手写脚本中**：规范 JSON 序列化、文件表哈希和归档规则会与安装校验静默漂移。
- **信任描述符自带的签名值**：任何占位符或过期签名都需要各自的处理规则，而工具链的职责恰恰是替换它。

## Consequences

发布者无需仓库专属代码即可完成 下载模板 → 生成密钥 → 签名 → 导出打印的信任记录 → 上传 的闭环，且市场网关 fixture 与生产使用同一签名 API。部署方仍需显式决定信任：默认不信任任何发布者，未修改的模板仍以 `untrusted-publisher` 失败，签名步骤仍是本地操作，没有注册表或远程发布服务。
