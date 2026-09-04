## Purpose

Keep the downloadable Tool publisher template aligned with the Tool registration contract the Host actually enforces, so a template install never breaks Host composition.

## ADDED Requirements

### Requirement: Template plugin satisfies the current registration contract
The Tool publisher template's example plugin SHALL declare the complete current Tool definition — name, description, parameter schema, canonical `output.schema`, a pure `output.render`, and an `execute` returning a value matching that schema — and SHALL register successfully against the real Tool registry.

#### Scenario: Activate the template plugin against the real registry
- **WHEN** the shipped template plugin is applied to a context mounting the real Tool registry
- **THEN** registration succeeds without contract errors
- **THEN** a call to its declared tool renders the canonical value through the declared output renderer

#### Scenario: Unsigned activation reaches the plugin
- **WHEN** a Host with unsigned packages allowed installs and activates the shipped template
- **THEN** composition completes and the declared tool becomes available after restart
