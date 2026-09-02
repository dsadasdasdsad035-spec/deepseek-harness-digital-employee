## MODIFIED Requirements

### Requirement: Template drafts authorize skills through the merged catalog

The system SHALL allow administrators to add marketplace-managed and non-market local Skills that are available through the draft's selected Agent preset, SHALL refresh availability when that preset changes, and SHALL prevent adding Skills unavailable to the selected preset.

#### Scenario: Administrator selects an active marketplace skill

- **WHEN** a marketplace-managed Skill is installed and available through the draft's selected preset
- **THEN** the administrator can select it and save its stable Skill name in the draft authority

#### Scenario: Administrator selects an active local skill

- **WHEN** a non-market local Skill is available through the draft's selected preset
- **THEN** the administrator can select it and save its stable Skill name in the draft authority

#### Scenario: Administrator attempts to select a skill outside the preset

- **WHEN** an installed or local Skill is not available through the draft's selected preset
- **THEN** the selector displays it as unavailable and does not add it to the draft authority

#### Scenario: Administrator changes the preset

- **WHEN** the administrator changes a draft from one preset to another
- **THEN** the editor reloads the Skill catalog for the new preset before allowing new Skill selections

### Requirement: Stale skill references remain removable

The system SHALL preserve a draft's selected Skill name in the editing UI when that name is absent or unavailable in the selected preset's merged catalog, SHALL identify the selection as unavailable, and SHALL allow the administrator to remove it.

#### Scenario: Previously selected skill was uninstalled

- **WHEN** an administrator edits a draft that references a Skill no longer present in either marketplace inventory or the selected preset
- **THEN** the selector displays the stale Skill as unavailable and allows it to be deselected

#### Scenario: Preset change invalidates a selected skill

- **WHEN** an administrator changes the preset and a previously selected Skill is unavailable in the new preset
- **THEN** the Skill remains selected and removable with a diagnostic naming the preset mismatch

#### Scenario: Draft retains an unavailable skill

- **WHEN** validation or publication is requested while a stale or preset-unavailable Skill remains selected
- **THEN** the operation reports an unavailable-Skill diagnostic and does not publish the draft
