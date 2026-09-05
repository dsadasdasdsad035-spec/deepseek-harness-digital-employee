## 1. Format and export

- [ ] 1.1 `employee-package.json` schema + parser + signing (reuse marketplace trust machinery)
- [ ] 1.2 Export remote: published template -> signed zip (instructions, experts, references manifest)
- [ ] 1.3 Tests: export round-trip, signature verification

## 2. Import and diagnostics

- [ ] 2.1 Import remote: validate zip, re-register the template, emit missing-reference diagnostics grouped by market kind
- [ ] 2.2 Web: studio export button + digital-employees workspace import (upload zip, show diagnostics)
- [ ] 2.3 Tests: import with all references satisfied; import with missing packages reports each; template id collision handling

## 3. Docs

- [ ] 3.1 Bilingual docs and Agent Note (references-not-inlining decision)
