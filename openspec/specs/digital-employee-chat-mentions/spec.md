# digital-employee-chat-mentions Specification

## Purpose
Enable users to select an active digital employee from the chat composer and start an attributable employee-owned conversation with the submitted task as its first message.
## Requirements
### Requirement: New tasks can target a digital employee

The Web application SHALL let users select exactly one available digital employee at the leading semantic position of a new-task composer.

#### Scenario: User opens the employee picker

- **WHEN** a user types `@` at the leading semantic position of a new-task composer
- **THEN** the system shows selectable active digital employees with identity and availability information

#### Scenario: User selects an employee

- **WHEN** a user selects an available employee
- **THEN** the composer inserts a structured employee reference associated with the stable employee instance identity

#### Scenario: User attempts an unsupported mention

- **WHEN** a user attempts to add a second employee or place an employee after task content
- **THEN** the composer rejects the employee selection without changing the current task owner

### Requirement: Employee task startup is atomic

The system SHALL create an employee-owned root Session and accept the remaining composer content as its first user message through one task-start operation.

#### Scenario: Employee task starts successfully

- **WHEN** a user submits a valid employee reference with non-empty task content
- **THEN** the system creates one root Session using that employee's resolved composition, records the first user message, and returns the new Session identity

#### Scenario: Repeated submission occurs

- **WHEN** the same in-flight submission is triggered repeatedly
- **THEN** the system creates at most one employee-owned root Session for that submission attempt

#### Scenario: Task content is empty

- **WHEN** a user submits an employee reference without task content or supported attachments
- **THEN** the system does not create an employee Session

### Requirement: Employee availability is enforced at submission

The Host SHALL accept a new employee task only when the employee exists, is active, and references an available template version with a valid authorized composition.

#### Scenario: Selected employee becomes inactive

- **WHEN** an employee is deactivated after selection but before submission
- **THEN** the Host rejects the task without creating a usable Session

#### Scenario: Employee template is unavailable

- **WHEN** the selected employee's required template version cannot be resolved
- **THEN** the Host rejects the task with an availability diagnostic

### Requirement: Composer state survives failed startup

The Web application SHALL clear the source composer and navigate to the employee conversation only after the Host accepts the task.

#### Scenario: Task startup fails

- **WHEN** employee validation, composition, Session creation, or first-message acceptance fails
- **THEN** the source composer retains its task content, employee reference, and attachments and displays the failure

#### Scenario: Task startup succeeds

- **WHEN** the Host returns an accepted employee Session identity
- **THEN** the Web application clears the submitted composer state and selects the new conversation

### Requirement: Employee ownership is durable

The system SHALL durably record the employee instance identity, template identity, template version, and resolved composition identity for every employee-owned root Session.

#### Scenario: Employee conversation is restored

- **WHEN** an employee-owned Session is restored after its employee was renamed, upgraded, or deactivated
- **THEN** the Session retains its creation-time employee ownership and composition identity without routing by display name

#### Scenario: Employee delegates internal work

- **WHEN** an employee-owned Session delegates to an expert Agent or subagent
- **THEN** the delegated work remains attributable to the recorded employee root Session and its existing authorization limits
