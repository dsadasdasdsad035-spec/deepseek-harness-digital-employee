# Workflow market template

English | [中文](README.zh.md)

Publisher template for marketplace workflow packages (`workflow-package.json`). Each entry in `workflows` binds one script to a workflow id the engine registers on mount:

- `entry` — a workflow script that must be declared in `files`; worker threads execute it, so dependencies stay in the package.
- `timeoutSec` — optional per-workflow timeout.

Replace the publisher placeholder, sign with `dsh-market-package --kind workflow`, and upload through the market Workflows tab.
