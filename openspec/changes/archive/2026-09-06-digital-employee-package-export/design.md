## Decisions

- **D1: References, not inlining.** Market assets stay referenced by id; the package records what the target Host needs.
- **D2: Signing reuses marketplace Ed25519 trust machinery.**
- **D3: Import is template registration plus a dependency report**, never automatic market install.
