## ADDED Requirements

### Requirement: Template drafts authorize skills through the merged catalog

The system SHALL allow administrators to add active marketplace skills and active non-market local skills from the merged template skill catalog, and SHALL prevent adding unavailable skills.

#### Scenario: Administrator selects an active marketplace skill

- **WHEN** a marketplace-managed skill is active in the runtime registry
- **THEN** the administrator can select it and save its skill name in the draft authority

#### Scenario: Administrator selects an active local skill

- **WHEN** a non-market local skill is active in the runtime registry
- **THEN** the administrator can select it and save its skill name in the draft authority

#### Scenario: Administrator attempts to select an inactive marketplace skill

- **WHEN** a marketplace-managed skill is installed but unavailable in the runtime registry
- **THEN** the selector displays it as disabled and does not add it to the draft authority

### Requirement: Stale skill references remain removable

The system SHALL preserve a draft's selected skill name in the editing UI when that name is absent or unavailable in the merged catalog, SHALL identify the selection as unavailable, and SHALL allow the administrator to remove it.

#### Scenario: Previously selected skill was uninstalled

- **WHEN** an administrator edits a draft that references a skill no longer present in either source
- **THEN** the selector displays the stale skill as unavailable and allows it to be deselected

#### Scenario: Draft retains an unavailable skill

- **WHEN** validation or publication is requested while a stale or inactive skill remains selected
- **THEN** the operation reports an unavailable-skill diagnostic and does not publish the draft
