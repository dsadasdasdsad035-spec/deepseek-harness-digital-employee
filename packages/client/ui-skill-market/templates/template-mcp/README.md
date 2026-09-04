# MCP Market ZIP Template

English | [中文](README.zh.md)

Edit `mcp-package.json` to declare servers of either transport, mixed in one package. A `streamable-http` server points at a remote URL. A `stdio` server ships its own entry in `server/index.js`: `command` must be a bare interpreter name the Host allowlists (`node` by default), every script path in `args` must be a declared file in `files`, and the server runs from the installed package directory.

`credentialReferences` maps a credential slot to an HTTP header or a stdio environment-variable name. Keep the matching fixed `headers` or `env` value empty. Never place an API key, token, password, or resolved authorization value in this ZIP. A package with any stdio server discloses `subprocess` execution before install.

Before distribution, sign the package with the repository CLI. Generate a local Ed25519 publisher key once, then build from the unpacked template directory:

```sh
npx dsh-market-package ./template-mcp \
  --kind mcp --publisher-id your-publisher-id \
  --generate-key ./publisher.pem --output your-package.zip
```

The CLI replaces the publisher placeholders, signs the canonical descriptor payload, and prints the matching `DSH_MARKET_TRUSTED_PUBLISHERS` JSON array on stdout. Persist that record with `--trust-file ~/.dsh/market-publishers.json` so every later Host restart trusts the publisher, or export the printed array in the launching shell for one launch; a publisher id may appear in only one source.

A stdio server entry runs with `node`; install `@modelcontextprotocol/sdk` and `zod` next to `server/index.js` before publishing.
