# Subagent market template

English | [中文](README.zh.md)

Publisher template for declarative subagent persona packages (`subagent-package.json`). Each entry in `subagents` declares a child persona the spawn driver composes on delegation:

- `instructions` — a persona instruction file that must be declared in `files`; provider code is never accepted.
- `tools` — the child's tool allowlist.
- `delegation` — optional policy (`mode`, `maxDepth`, `maxConcurrency`, `timeoutMs`) enforced on every delegation.

Replace the publisher placeholder, sign with `dsh-market-package --kind subagent`, and upload through the market Subagents tab.
