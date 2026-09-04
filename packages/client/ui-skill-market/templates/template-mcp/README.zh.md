# MCP 市场 ZIP 模板

[English](README.md) | 中文

编辑 `mcp-package.json` 以声明服务，两种传输可以在同一个包内混用。`streamable-http` 服务指向远端 URL。`stdio` 服务自带 `server/index.js` 入口：`command` 必须是 Host 白名单内的裸解释器名（默认 `node`），`args` 中的脚本路径必须是 `files` 中声明的文件，服务从安装后的包目录运行。

`credentialReferences` 将凭据 slot 映射到 HTTP 请求头或 stdio 环境变量名。对应的固定 `headers` 或 `env` 值必须保持为空。切勿在此 ZIP 中放入 API 密钥、token、密码或解析后的授权值。包含 stdio 服务的包在安装前会披露 `subprocess` 本地执行。

发布前，使用仓库 CLI 签名包。首次先生成本地 Ed25519 发布者密钥，然后在解包后的模板目录上构建：

```sh
npx dsh-market-package ./template-mcp \
  --kind mcp --publisher-id your-publisher-id \
  --generate-key ./publisher.pem --output your-package.zip
```

CLI 会替换发布者占位符、对规范描述符载荷签名，并在 stdout 输出匹配的 `DSH_MARKET_TRUSTED_PUBLISHERS` JSON 数组。用 `--trust-file ~/.dsh/market-publishers.json` 持久化该记录，之后每次 Host 重启都会信任该发布者；也可以只在启动 shell 中导出打印的数组用于单次启动。同一发布者 id 只能出现在一个来源中。

stdio 服务入口以 `node` 运行；发布前请在 `server/index.js` 旁安装 `@modelcontextprotocol/sdk` 与 `zod`。
