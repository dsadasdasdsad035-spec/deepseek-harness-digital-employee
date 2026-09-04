# Tool Market ZIP Template

English | [中文](README.zh.md)

Edit `tool-package.json`, declare every Tool and requested permission, and keep `plugin/index.js` free of install-time side effects. The Host verifies the ZIP without evaluating code; trusted code activates only after a fresh Host composition.

Before distribution, sign the package with the repository CLI. Generate a local Ed25519 publisher key once, then build from the unpacked template directory:

```sh
npx dsh-market-package ./template-tool \
  --kind tool --publisher-id your-publisher-id \
  --generate-key ./publisher.pem --output your-package.zip
```

The CLI computes the SHA-256 `files` table, replaces the publisher placeholders, signs the canonical descriptor payload, and prints the matching `DSH_MARKET_TRUSTED_PUBLISHERS` JSON array on stdout. Persist that record with `--trust-file ~/.dsh/market-publishers.json` so every later Host restart trusts the publisher, or export the printed array in the launching shell for one launch; a publisher id may appear in only one source.

If an older template install blocks Host startup, remove its managed directory (for example `rm -rf ~/.dsh/tools/tool-market-template`) and install the repaired template again; an installed package is never silently replaced by a re-upload.
