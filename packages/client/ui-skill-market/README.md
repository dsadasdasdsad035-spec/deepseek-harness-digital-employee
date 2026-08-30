# `@deepseek-ai/dsh-client-ui-skill-market`

English | [中文](README.zh.md)

Browser-side reference for the localized skill marketplace settings section.

## Composition

The plugin registers locale dictionaries, a settings navigation item, and a settings section through client slots. It calls the generated `ctx.remote.skillMarket` namespace from `@deepseek-ai/dsh-api-remotes`; archive validation, ownership decisions, and filesystem mutation remain on the Host.

The section displays only the Host's managed inventory. Filesystem-discovered hand-managed skills are outside this view and cannot be upgraded or uninstalled here.

## Inventory And Search

On mount and after successful mutation, the store requests the authoritative inventory. The UI has distinct idle, loading, ready, empty, and error states with retry behavior.

Search is local and case-insensitive across skill name, description, author, and tags. Cards render version, author, tags, and a promotional image when supplied. Images load lazily from Host-validated PNG, JPEG, WebP, or GIF bytes; loading, missing, and failed images retain stable placeholders.

## Upload And Upgrade

The upload control accepts one `.zip` file and rejects files larger than 10 MiB before encoding. The Host repeats all security checks, including strict ZIP layout, descriptor metadata, path safety, 256-file and 30 MiB extraction limits, and the 2 MiB promotional-image limit.

The initial request omits replacement intent. A successful install refreshes inventory and shows a dismissible notice. Only the structured `managed-upgrade-required` outcome opens the confirmation flow and retains the encoded candidate; confirm resubmits with explicit replacement intent, while cancel or section disposal releases it. Unmanaged conflicts and incompatible manifests show refusal states without an override action.

## Uninstall

Uninstall always requires confirmation. While the request is pending, the matching action is disabled and the section exposes progress. Success releases the corresponding image data, closes confirmation, refreshes inventory, and shows the resulting state. A structured ownership or not-found failure remains visible without assuming that the Host changed the target.

## Async Lifecycle

Inventory, upload, uninstall, and per-image operations use generation guards. A superseded response cannot publish over newer state, and disposing the section prevents future publication while releasing retained archive and image data.

Declared marketplace failures map by discriminant to localized messages. Transport, cancellation, and unexpected failures use the generic operation failure state and diagnostic logging; the browser never parses Host error prose.

## Model Experience

None, as marketplace uploads and mutations do not add prompt sections, tools, session events, or request inputs.

#### KV Cache effect

Marketplace interactions do not add or modify request history.

## Known Limitations and Deferred Work

- The browser sends base64 JSON through the shared `/api` Remote carrier; it does not extract archives or write Host files.
- The first version supports local ZIP upload, one promotional image per skill, manual managed upgrade, and confirmed uninstall.
- The UI does not provide a hosted registry, URL downloads, ratings, signing, dependency resolution, automatic updates, or project and preset installation.
- Marketplace interactions do not create session events, alter model-visible prompts or requests, or change either SDK.
