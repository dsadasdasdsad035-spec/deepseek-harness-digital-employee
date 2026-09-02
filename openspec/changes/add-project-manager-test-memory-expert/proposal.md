## Why

The `project-manager-test` template exposes skills, tools, and MCP data but does not initialize the Atlas memory seed for employees created in the Web management flow, and it declares no expert Agent. It therefore cannot demonstrate the intended memory and expert-delegation behavior of a complete digital employee.

## What Changes

- Initialize the package-owned Atlas long-term memory record exactly once for each newly created `project-manager-test` employee.
- Add a constrained Risk Reviewer expert to the `project-manager-test` template.
- Allow the root Project Manager to delegate bounded risk-review work to that expert.
- Give the expert its own instructions and only the project-data MCP, risk-review skill, and read-only project evidence tools required for review.
- Extend package, assembled, and Web-composition coverage for the memory and expert behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `digital-employee-memory`: package-owned employee initialization may create an attributable long-term seed record for each new instance.
- `digital-employee-experts`: the project-manager test template declares and delegates to a bounded risk-review expert.
- `digital-employee-templates`: the project-manager test template exposes the memory-backed, expert-enabled composition.

## Impact

- `@deepseek-ai/dsh-project-manager-test-digital-employee` template, instructions, and tests.
- Digital employee creation orchestration and its Host/Web assembled composition.
- Existing project-manager fixture documentation, Agent Note, and deterministic snapshot coverage.
