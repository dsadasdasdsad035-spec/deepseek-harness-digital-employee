## Why

Digital employees can currently be started only from their management workspace, where the action creates a root Session without accepting the user's task or navigating to a conversation. Users need a discoverable chat-native entry point that preserves employee identity, memory, authorization, and audit ownership from the first message.

## What Changes

- Add a structured `@digital employee` mention source to the new-chat composer.
- Allow exactly one active digital employee at the leading semantic position of a new task.
- Atomically create an employee-owned root Session and submit the remaining composer content as its first user message.
- Navigate to the new employee conversation only after the Host accepts the task; retain the draft, mention, and attachments on failure.
- Replace the management workspace's empty `Run task` action with `Start chat`, which opens the same composer flow with that employee preselected.
- Record stable employee ownership and resolved template identity in durable Session events instead of routing by display text.
- Cover Host, Remote, Web, runnable example, keyless snapshot, and user documentation behavior.

## Capabilities

### New Capabilities

- `digital-employee-chat-mentions`: Structured employee discovery, selection, validation, atomic task startup, conversation navigation, and failure recovery from the chat composer.

### Modified Capabilities

- `digital-employee-management`: Management task entry routes users into the chat composer instead of creating an empty root Session.

## Impact

The change affects the conversation input reference and submission extension points, digital employee Web UI and client store, Remote BFF types and assembly, Host employee task startup, Agent/Session ownership events and projections, Web application composition, runnable examples, snapshots, and user and architecture documentation. It introduces no new external dependency and does not change `agent-loop`; employee expert, subagent, skill, tool, MCP, memory, and authorization behavior remains behind the existing digital employee composition services.
