## ADDED Requirements

### Requirement: Example Skill participates in the digital employee reference workflow
The installed example Skill SHALL expose a stable identity and model-visible instruction that can be selected by a digital employee template and observed in an employee-owned conversation without external services.

#### Scenario: Administrator grants the example Skill
- **WHEN** the unmodified example Skill is installed, active, and selected in a digital employee template
- **THEN** the published template records the example Skill identity
- **THEN** a task started for an employee created from that template can load its instruction
