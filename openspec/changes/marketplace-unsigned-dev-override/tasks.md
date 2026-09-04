## 1. Gateway override

- [x] 1.1 Add `allowUnsignedPackages` (default `false`) to both gateway configs and service options; gate the install and activation trust-verification call sites.
- [x] 1.2 Wire the Web bundle default (`DSH_MARKET_ALLOW_UNSIGNED !== '0'`) into both marketplaces in `packages/bundle/web-app/cordis.patch.yml`.

## 2. Tests and docs

- [x] 2.1 Cover both gateways: override install of an unsigned template archive, activation across a fresh composition while enabled, untrusted failure after the override is removed, and unchanged rejection with the default configuration.
- [x] 2.2 Update the marketplace Agent Note and both package READMEs with the override, its launch-environment wiring, and its scope.
- [x] 2.3 Run focused marketplace tests, the host build, and the affected doc gates.
