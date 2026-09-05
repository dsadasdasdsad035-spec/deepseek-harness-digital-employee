## Decisions

- **D1: References, not inlining.** Market assets (skills, tools, mcp, hooks, workflows, subagents) stay referenced by id; the package records what the target Host must install. Inlining would duplicate the six market formats inside the employee package.
- **D2: Signing reuses the marketplace Ed25519 trust machinery** — same key pairs, same trust files.
- **D3: Import is a template registration plus a dependency report**, never an automatic market install; the user installs missing packages through the markets explicitly.
