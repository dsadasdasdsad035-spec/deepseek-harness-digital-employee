## Why

Digital employee templates can authorize Skills that are present in the selected preset while the resulting chat Agent cannot discover or invoke them: the employee Tool allowlist can hide the shared `skill` loader, and some presets do not mount that loader at all. The `@数字员工` chat path also starts work without requesting the employee's relevant long-term memory, so assembled tests overstate what users receive in real conversations.

## What Changes

- Make the model-facing Skill catalog and loader required runtime infrastructure whenever a digital employee is granted model-invocable Skills.
- Keep employee business Tool authorization independent from the infrastructure needed to invoke an authorized Skill; users and template administrators do not grant `skill` as a marketplace Tool.
- Reject or diagnose a template/preset composition that grants Skills but cannot publish and load them for the employee Agent.
- Make a new `@数字员工` task retrieve a bounded, employee-owned long-term memory projection using the submitted task as retrieval context.
- Strengthen the project-manager reference employee and keyless assembled coverage to prove that the model receives the Skill catalog, invokes an authorized Skill, receives its instructions, and sees relevant long-term memory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `digital-employee-capabilities`: Authorized Skills must remain discoverable and invocable independently of the employee's business Tool grants.
- `digital-employee-chat-mentions`: Starting an employee-owned chat must compose the employee's effective runtime capabilities and retrieve relevant bounded memory for the initial task.
- `digital-employee-memory`: Ordinary employee task startup must request and durably record the relevant employee-owned long-term memory projection.
- `project-manager-test-digital-employee`: The reference workflow must prove real Skill catalog publication and Skill loading instead of only inspecting registry declarations.

## Impact

The change affects digital employee Agent composition, preset validation, the chat-management Host gateway, the model-facing Skill consumer, the project-manager test preset, and assembled keyless snapshot/Web coverage. It does not change persisted template capability identifiers or require administrators to add the infrastructure `skill` Tool to existing template Tool grants.
