# Tool Market ZIP Template

English | [中文](README.zh.md)

Edit `tool-package.json`, declare every Tool and requested permission, and keep `plugin/index.js` free of install-time side effects. The Host verifies the ZIP without evaluating code; trusted code activates only after a fresh Host composition.

Before distribution, calculate SHA-256 for every non-descriptor file, write the lowercase hashes into `files`, sign the canonical descriptor payload with Ed25519, and replace the publisher signature placeholder. Configure the matching public key in `DSH_MARKET_TRUSTED_PUBLISHERS`.

The signature payload is compact JSON for the complete descriptor with `publisher.signature` omitted. Use the repository helper `descriptorSignaturePayload()` to avoid serialization differences.
