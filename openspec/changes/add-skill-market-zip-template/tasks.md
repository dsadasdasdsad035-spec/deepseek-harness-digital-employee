## 1. Template Package

- [x] 1.1 Add a small author-readable example skill directory with valid `SKILL.md` metadata, explanatory content, and a non-executable reference file.
- [x] 1.2 Add a deterministic template archive generation path and commit the resulting downloadable ZIP asset with a meaningful filename.
- [x] 1.3 Add template packaging coverage that rejects drift, unsafe entries, missing required metadata, or unexpected archive contents.

## 2. Marketplace Download

- [x] 2.1 Add a marketplace upload-surface download action that serves the shipped template ZIP through normal browser download behavior.
- [x] 2.2 Update client-facing types, static asset handling, and package metadata required to include the template in source and built Web outputs.

## 3. End-to-End Verification

- [x] 3.1 Add an isolated marketplace installation test that uploads the shipped ZIP and verifies the example skill is installed and listed.
- [x] 3.2 Add or update a built Web smoke test that verifies the download action and template asset are present in the shipped application.
- [x] 3.3 Run focused template, marketplace, and Web verification commands, then run `openspec validate add-skill-market-zip-template --strict`.
