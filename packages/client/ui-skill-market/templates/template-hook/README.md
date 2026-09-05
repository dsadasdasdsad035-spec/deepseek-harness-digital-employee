# Hook market template

English | [中文](README.zh.md)

Publisher template for marketplace hook packages (`hook-package.json`). Each entry in `hooks` binds one shell command to one agent interception event:

- `event` — one of `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`.
- `matcher` — required for every event except `SessionStart`; the bridge evaluates it against the event's query subject (literal-or-regex as in Claude Code).
- `command` — a bare interpreter name the Host allowlists (default `['node']`); `args` entries containing `/` must be declared in `files`.
- `invocable` — when `true`, installation additionally registers a `hook__<id>` model tool so chat participants can trigger the hook on demand.

Replace the publisher placeholder, sign with `dsh-market-package --kind hook`, and upload through the market Hooks tab. The shipped `hooks/echo.js` test hook echoes a summary of its stdin payload, making the install → bind → trigger chain observable end to end.
