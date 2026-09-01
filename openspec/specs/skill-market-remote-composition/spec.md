# skill-market-remote-composition Specification

## Purpose
Ensure the skill marketplace Remote namespace composes into the shared Web client API without duplicate registrations while preserving its typed operations.
## Requirements
### Requirement: Conflict-free marketplace Remote registration
The assembled Web Host SHALL register the skill marketplace Remote namespace without a method-versus-namespace service conflict.

#### Scenario: Web Host loads marketplace plugins
- **WHEN** the Web Host loads the API gateway, API Remote bundle, and skill marketplace plugins
- **THEN** plugin application completes without a duplicate or conflicting `skillMarket` registration

#### Scenario: Marketplace install operation mounts
- **WHEN** the client Remote bundle mounts the marketplace contribution
- **THEN** the `install` endpoint is registered under the `skillMarket` namespace without colliding with namespace bookkeeping

### Requirement: Marketplace namespace remains available
The shared client API SHALL expose the typed `skillMarket.banner`, `skillMarket.install`, `skillMarket.list`, and `skillMarket.uninstall` operations through its existing transport.

#### Scenario: Client resolves marketplace operations
- **WHEN** a Web client obtains the assembled API client after Host startup
- **THEN** all four marketplace operations are callable through the `skillMarket` namespace

#### Scenario: Marketplace request uses shared API carrier
- **WHEN** the client invokes a marketplace operation
- **THEN** the request uses the shared API transport and its typed result protocol
