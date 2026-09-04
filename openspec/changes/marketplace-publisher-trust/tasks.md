## 1. Trust file resolution

- [x] 1.1 Add a shared Harness-home trust-file reader to `packages/util/marketplace-core`: parse the JSON array, validate `{ id, publicKeyPem }` records with unique ids, and reject non-regular, symlinked, or group/world-writable files with diagnostics naming the path and record.
- [x] 1.2 Add the optional `trustedPublishersFile` config to the Tool and MCP marketplace gateways; composition reads the file and combines it with inline records, failing on any duplicated publisher id.
- [x] 1.3 Wire `dshHomePath('market-publishers.json')` into both gateways in `packages/bundle/web-app/cordis.patch.yml`.
- [x] 1.4 Cover the reader and both gateway compositions with tests: absent file, valid merge, every malformed shape, unsafe permissions, and cross-source duplicate ids.

## 2. CLI persistence

- [x] 2.1 Add `--trust-file <path>` to `dsh-market-package`: create the file `0600` with the emitted record when absent, merge by publisher id when present, and refuse an id whose public key differs.
- [x] 2.2 Extend CLI and built-bin tests for create, merge, permission mode, and the differing-key refusal, keeping stdout output unchanged.

## 3. Diagnostics and UI

- [x] 3.1 Preserve the typed marketplace failure (code plus publisher id) through the Tool and MCP client package stores instead of reducing it to a string code.
- [x] 3.2 Interpolate the publisher id into the untrusted-publisher and invalid-signature locale entries in every supported locale and in the shared failure-text helper.
- [x] 3.3 Update component tests for both tabs' failure rendering and the marketplace web e2e assertion that exercises an untrusted upload.

## 4. Documentation and verification

- [x] 4.1 Update Tool and MCP template READMEs (all locales), the marketplace-core README, and the publisher-toolchain Agent Note with the persistent trust file, `--trust-file`, and the precedence rules.
- [x] 4.2 Add an end-to-end test: sign a template, persist trust through `--trust-file`, boot a fresh Host composition, and install the signed package without launch-environment variables.
- [x] 4.3 Run focused marketplace package tests, CLI and built-bin tests, template generation, and the affected doc gates; record results.
