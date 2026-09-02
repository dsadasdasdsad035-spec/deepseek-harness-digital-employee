## MODIFIED Requirements

### Requirement: Tool package inventory and lifecycle

The system SHALL use the target Harness home’s Tool installation root when the suite bundle provides the Tool marketplace, and SHALL expose the inventory to Template configuration only after the package’s normal trust and restart checks succeed.

#### Scenario: Suite exposes a managed Tool

- **WHEN** a trusted Tool package is installed in the target project and the Host is restarted
- **THEN** the Tool marketplace lists it and Template configuration can select its registered tools
- **THEN** an untrusted or not-yet-activated package remains unavailable
