## 1. Installable Marketplace Examples

- [x] 1.1 Define stable identities, descriptors, and deterministic behavior for `marketplace-test-skill`, `marketplace_test_echo`, `marketplace-test-mcp`, and `mcp__marketplace-test-mcp__lookup`.
- [x] 1.2 Add a directly installable Skill example archive and focused tests proving the downloaded archive passes normal marketplace validation unchanged.
- [x] 1.3 Add a directly installable Tool example archive signed by a documented test-only Ed25519 publisher, with tests for valid installation, deterministic invocation, and rejection under production trust defaults.
- [x] 1.4 Add a directly installable declarative MCP example archive with Streamable HTTP, endpoint-reference, and credential-reference metadata, with tests proving no resolved endpoint or credential value is embedded in the archive.
- [x] 1.5 Keep the Tool and MCP author templates distinct from the installable examples and update marketplace download UI and metadata so users can identify each artifact's purpose.

## 2. Offline Runtime Fixtures

- [x] 2.1 Implement a loopback Streamable HTTP MCP test server on an ephemeral port that verifies fixture authorization metadata and exposes the deterministic lookup Tool.
- [x] 2.2 Add Host-owned MCP endpoint-reference resolution and isolated test credential configuration so the example resolves an ephemeral loopback URL and credential without rewriting its package or exposing the credential value.
- [x] 2.3 Extend the assembled Host/Web scaffold to accept explicit Tool publisher trust, marketplace example paths, the MCP endpoint, and the preserved temporary Harness Home.
- [x] 2.4 Add clean Host stop-and-relaunch support with readiness checks so tests can assert pending activation before restart and registered capabilities after restart without fixed sleeps.

## 3. Catalog And Template Workflow

- [x] 3.1 Add focused catalog coverage proving installed examples correlate with preset-scoped Skills, registered Tools, and configured MCP clients, including provenance, version, publisher, availability, and restart diagnostics.
- [x] 3.2 Verify installed but inactive examples cannot be newly selected while unresolved references retained by an existing draft remain removable.
- [x] 3.3 Extend configuration-studio tests to select the three active examples, validate the combined authority, publish an immutable template version, and create and activate an employee from it.
- [x] 3.4 Add negative coverage proving publication fails when one referenced example is inactive, uninstalled, outside the selected preset, or otherwise unavailable.

## 4. Employee Runtime And Transcript

- [x] 4.1 Add a runnable keyless example with a deterministic model sequence that loads the example Skill, calls `marketplace_test_echo`, calls `mcp__marketplace-test-mcp__lookup`, and reports stable result markers.
- [x] 4.2 Prove the employee composition exposes only template-selected marketplace capabilities and denies or omits a known installed but undeclared capability for the employee and delegated Agents.
- [x] 4.3 Assert durable Session and audit evidence attributes the Skill load, Tool call, and MCP request to the employee-owned Session and acting Agent without credential values.
- [x] 4.4 Add or update the keyless assembled snapshot to cover the model-visible employee transcript and any required snapshot-harness support.

## 5. Web End-To-End Workflow

- [x] 5.1 Extend marketplace Web E2E to download or upload and install the Skill, Tool, and MCP example archives through their user-facing workflows.
- [x] 5.2 Assert Tool and MCP examples are restart-pending, relaunch the Host against the same Harness Home, and verify all three examples become available in Template configuration.
- [x] 5.3 Automate draft creation, capability selection, validation, publication, employee creation, and employee activation through the administrator UI.
- [x] 5.4 Start a new task through the leading `@` employee picker and verify the completed conversation and structured runtime evidence contain the Skill, Tool, and MCP fixture markers.
- [x] 5.5 Verify the same conversation cannot discover or invoke the installed but undeclared fixture capability and retains durable ownership by the selected employee.

## 6. Documentation And Verification

- [x] 6.1 Add the required Agent Note describing fixture ownership, explicit test-only publisher trust, restart semantics, offline MCP setup, and the authoritative verification layers.
- [x] 6.2 Update affected marketplace, Template configuration, digital employee, and testing documentation and JSDoc to distinguish author templates from installable test examples and explain credential-reference-only setup.
- [x] 6.3 Run focused Skill, Tool marketplace, MCP marketplace, catalog, configuration-studio, digital employee, and Web scaffold tests covering the changed behavior.
- [x] 6.4 Run the relevant keyless snapshot and Web E2E workflow, then run the smallest applicable typecheck, lint, build, hygiene, documentation, and diff checks selected by the repository pre-push policy.
