# MCP Market ZIP Template

English | [中文](README.zh.md)

Edit `mcp-package.json` to declare Streamable HTTP servers. `credentialReferences` maps an HTTP header to a credential reference slot. Keep the matching fixed `headers` value empty. Never place an API key, token, password, or resolved authorization value in this ZIP.

Before distribution, sign the canonical descriptor payload with Ed25519 and replace the publisher signature placeholder. Configure the matching public key in `DSH_MARKET_TRUSTED_PUBLISHERS`.

The signature payload is compact JSON for the complete descriptor with `publisher.signature` omitted. Use the repository helper `descriptorSignaturePayload()` to avoid serialization differences.
