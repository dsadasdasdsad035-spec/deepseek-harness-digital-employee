# Proposal: company-group-chat-surface

## Why

The group chat and the session chat share one foundation (sessions, persistence, realtime) but render in two surfaces: group messages only exist inside the console's embedded panel, and opening the group session from the session sidebar shows an empty conversation — the main conversation renderer has no node for `company-group/message`. Owners expect one system: the group IS a session in the list, chat opens it like any conversation, and replies are typed in the same composer.

## What Changes

- **Marker event**: `ensureGroup` appends `company-group/opened {companyId}` once at creation, so any client can identify a group session from its own events (no header-format change, no id-prefix guessing).
- **Main-surface rendering**: a `ConversationNodeDefinition` (kind `company-group/message`) renders each group message as a speaker-attributed bubble in the standard conversation view — employee messages left-aligned with a name chip, the user's own messages right-aligned like user messages.
- **Composer routing**: when the active session carries the group marker, the main composer's send routes to `companyGroups.sendCompanyGroupMessage` instead of the agent submit path; @mentions keep working through the existing host routing.
- **Console entry**: the floor panel's 「公司群聊」 button opens (creating if needed) the group and switches the main surface to that session; the embedded panel is removed. Employee replies stream into the open conversation through the existing session-event channel.

## Capabilities

### Modified

- `company-group-chat`: 群聊入口与渲染 requirement — main-surface rendering, composer routing, console button as a shortcut, marker-based session identification.
