# Agent Note: Employee package export and import

Status: implemented

English | [中文](2026-09-06-digital-employee-package-export.zh.md)

## Problem

Published digital employee templates were local-only. Distributing an employee to another Host required hand-copying files and re-registering them manually.

## Decision

`employee` becomes the sixth marketplace package kind. `employee-package.json` declares a template (display metadata, instructions file, experts, delegation policy) plus a references manifest naming required market packages. ExportTemplate serializes a published local template into a signed zip using the marketplace Ed25519 machinery; ImportTemplate validates the archive (file hashes, optional publisher trust), writes instruction and expert files to the template root, re-registers the template, and reports missing market references as grouped diagnostics. The parser rejects instruction and expert paths absent from the signed file table.

## Alternatives considered

- **Inlining market assets inside the employee package** — duplicates six market formats and breaks asset version independence.
- **Automatic market install on import** — the user installs missing packages explicitly through the markets.

## Consequences

Employee packages are declarative and never ship provider code. Import never auto-installs; missing references surface as actionable diagnostics grouped by market kind.
