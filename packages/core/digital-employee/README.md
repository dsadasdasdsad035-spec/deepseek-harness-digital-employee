# @deepseek-ai/dsh-digital-employee

English | [中文](README.zh.md)

Service Definition for reusable digital employee templates and durable employee instances. The service owns effect-scoped template registration and delegates mutable instance, memory, lifecycle, and audit operations to one configured provider.

Templates pin an exact version and declare identity, personality, an `AGENTS.md` source, preset, explicit capabilities, named experts, memory access, and delegation limits. Providers must resolve an active instance before creating a task Session; missing template versions or required references fail instead of selecting a replacement.

## Service

`ctx.digitalEmployees.registerTemplate()` validates and registers one immutable template version. The returned disposer removes that exact contribution. `configureProvider()` installs the sole durable provider for instance, memory, resolution, and audit operations.

Capability arrays are allowlists. Consumers compute effective child authority by intersecting template declarations, instance grants, and inherited Agent authority.

Templates are executable definitions, not mutable employee records. Updating a template registers another immutable version; an existing employee remains pinned until an explicit upgrade previews capability changes and applies reviewed grants.

## Instances and Lifecycle

Providers create inactive instances with independent IDs, names, personality overrides, grants, memory, and audit history. The lifecycle is `inactive` → `active` → `inactive` or `deleting`; removal is allowed only from `deleting`, after owned work has drained.

Exports omit credentials and preserve portable employee data. Imports allocate a fresh inactive instance rather than restoring the source identity.

Employee-owned root Sessions record their creation-time employee ID, template ID and version, resolved composition ID, display name, and personality in the required `digital-employee/identity` event. `projectDigitalEmployeeOwnership()` restores that snapshot from the log, so later rename, upgrade, deactivation, or removal does not change historical ownership.

## Memory Records

Task memory carries a stable employee task ID and remains local to that work unless promoted. Session memory carries its owning Session ID and is reconstructed with that Session. Long-term memory belongs to the employee independently of one Session.

Every memory record carries employee ownership, content, tags, sensitivity, provenance, and an optional expiration time. Retrieval requests select employee-owned scopes with an explicit result limit. Long-term writes enter as promotion candidates with optional retention days and return an explicit accepted record or rejection reason.

## Model Experience

### Consumer projections

#### What the model sees

Consumers render resolved identity, `AGENTS.md` instructions, bounded memory, and expert results from logged Session events.

#### Token effect

The Definition adds no tokens directly; Consumer-selected instructions and memory determine the added request content.

#### KV Cache effect

Consumer projections may replace the employee-specific prompt prefix when template versions, instance personality, authority, or retrieved memory changes.

## Known Limitations and Deferred Work

- **No bundled provider** - this package defines the service and template registry; instance persistence and task composition require a separately mounted provider and Consumer.
