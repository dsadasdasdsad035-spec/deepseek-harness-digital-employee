# Tool 市场 ZIP 模板

[English](README.md) | 中文

编辑 `tool-package.json`，声明每个 Tool 及其请求的权限，并确保 `plugin/index.js` 不包含安装时副作用。Host 校验 ZIP 时不会执行代码；受信任代码仅在新的 Host 组合启动后激活。

发布前，使用仓库 CLI 签名包。首次先生成本地 Ed25519 发布者密钥，然后在解包后的模板目录上构建：

```sh
npx dsh-market-package ./template-tool \
  --kind tool --publisher-id your-publisher-id \
  --generate-key ./publisher.pem --output your-package.zip
```

CLI 会计算 SHA-256 `files` 表、替换发布者占位符、对规范描述符载荷签名，并在 stdout 输出匹配的 `DSH_MARKET_TRUSTED_PUBLISHERS` JSON 数组。用 `--trust-file ~/.dsh/market-publishers.json` 持久化该记录，之后每次 Host 重启都会信任该发布者；也可以只在启动 shell 中导出打印的数组用于单次启动。同一发布者 id 只能出现在一个来源中。

如果旧版模板安装导致 Host 启动失败，请删除其托管目录（例如 `rm -rf ~/.dsh/tools/tool-market-template`）后重新安装修复版模板；重新上传不会静默替换已安装的包。
