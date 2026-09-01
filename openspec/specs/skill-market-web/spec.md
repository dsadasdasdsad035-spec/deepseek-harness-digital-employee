# skill-market-web Specification

## Purpose
Provide a localized Web settings experience where users can inspect marketplace-managed skills and safely complete upload, upgrade, image viewing, and uninstall workflows.
## Requirements
### Requirement: Marketplace settings navigation
The Web application SHALL contribute a localized skill marketplace section through the existing settings navigation and content slots, without requiring the settings shell to import marketplace implementation code directly.

#### Scenario: Open marketplace settings
- **WHEN** a user selects the localized skill marketplace navigation item
- **THEN** the settings content displays the marketplace section
- **THEN** the section begins loading the Host inventory

### Requirement: Skill information presentation
The marketplace section SHALL present each managed skill's name, description, optional version, optional author, tags, management status, and promotional image in a stable responsive layout. Missing or failed images SHALL use a non-deceptive placeholder without hiding the skill metadata.

#### Scenario: Inventory with promotional images
- **WHEN** the Host lists managed skills with available promotional images
- **THEN** the Web client requests and displays each image with accessible alternative text

#### Scenario: Missing or failed promotional image
- **WHEN** a skill has no image or its image request fails
- **THEN** the card remains usable and displays a stable placeholder and localized status

#### Scenario: Loading and empty inventory
- **WHEN** inventory loading is in progress or completes with no managed skills
- **THEN** the section displays the corresponding localized loading or empty state

### Requirement: Local marketplace search
The marketplace section SHALL filter the loaded inventory case-insensitively by skill name, description, author, and tags without mutating Host state.

#### Scenario: Search matches metadata
- **WHEN** a user enters text matching a skill's name, description, author, or tag
- **THEN** matching cards remain visible and non-matching cards are hidden

#### Scenario: Search has no matches
- **WHEN** no loaded skill matches the search text
- **THEN** the section displays a localized filtered-empty state distinct from an empty inventory

### Requirement: ZIP upload and install workflow
The Web client SHALL accept a single `.zip` file by picker or drag and drop, reject files larger than 10 MiB before transport, encode an accepted file for the typed marketplace Remote, and keep the Host as the authoritative validator.

#### Scenario: Client rejects unsupported file
- **WHEN** a user selects a non-ZIP file or a file larger than 10 MiB
- **THEN** the section shows a localized validation message
- **THEN** it does not submit the file to the Host

#### Scenario: New skill installs successfully
- **WHEN** the Host accepts an uploaded bundle as a new installation
- **THEN** the section shows progress followed by localized success feedback
- **THEN** it reloads the inventory so the installed skill and image state reflect Host data

#### Scenario: Host rejects uploaded content
- **WHEN** the Host returns a structured archive, descriptor, image, ownership, or resource-limit failure
- **THEN** the section maps the code to localized actionable text
- **THEN** it preserves enough state for the user to choose another file or retry

### Requirement: Explicit managed upgrade workflow
The Web client SHALL request confirmation only when the Host identifies a supported managed same-name installation that requires explicit replacement. It MUST NOT offer an override for unmanaged or incompatible same-name targets.

#### Scenario: Confirm managed upgrade
- **WHEN** the initial install attempt returns a managed-upgrade-required result
- **THEN** the section displays a localized confirmation naming the affected skill and installed version when available
- **THEN** confirmation resubmits the upload with explicit replacement intent

#### Scenario: Cancel managed upgrade
- **WHEN** the user cancels the upgrade confirmation
- **THEN** the existing installation remains unchanged
- **THEN** the pending archive data is released from client state

#### Scenario: Unmanaged target conflict
- **WHEN** the Host reports an unmanaged or incompatible same-name target
- **THEN** the section displays a localized refusal
- **THEN** it does not present a replacement confirmation

### Requirement: Confirmed uninstall workflow
The Web client SHALL require confirmation before requesting uninstall, SHALL disable duplicate actions while the request is pending, and SHALL refresh the inventory after successful removal.

#### Scenario: Confirm uninstall
- **WHEN** a user confirms uninstall for a managed skill
- **THEN** the section shows localized pending state until the Host settles the request
- **THEN** a successful removal refreshes the inventory and releases the removed image data

#### Scenario: Cancel uninstall
- **WHEN** a user cancels the uninstall confirmation
- **THEN** no uninstall request is sent
- **THEN** the card remains in the current inventory

#### Scenario: Uninstall failure
- **WHEN** the Host refuses or fails an uninstall request
- **THEN** the section displays a localized error and keeps the current inventory available

### Requirement: Recoverable asynchronous states
The marketplace section SHALL expose localized loading, retry, progress, success, and failure states through accessible status or alert semantics. Stale responses from superseded loads or disposed UI instances MUST NOT overwrite newer state.

#### Scenario: Retry inventory load
- **WHEN** inventory loading fails and the user activates retry
- **THEN** the section starts a fresh load and replaces the error state only with that load's result

#### Scenario: Section unmounts during request
- **WHEN** the marketplace section is disposed while a load, image read, install, or uninstall is pending
- **THEN** the pending work is cancelled when supported
- **THEN** its eventual result does not update the disposed section
