## Context

See `proposal.md` for motivation and the two capability specs for observable behavior. The existing skill registry delegates user-directory discovery to `skill-filesystem`; marketplace code must mutate that directory without becoming a second skill loader. The shipped Web app already carries generated Typert Remote namespaces over the Connection-backed `/api` gateway and composes settings features through client slots.

The current worktree contains an exploratory marketplace implementation using an independent `/skill-market` Connection channel. Its archive checks and UI states are useful requirement evidence, but its error protocol encodes business data inside an `internal` error message and asks the browser to reconstruct it. That wire format is not suitable for a durable product API.

## Goals / Non-Goals

**Goals:**

- Keep filesystem discovery, parsing, precedence, and model-visible skill loading owned by `skill-filesystem` and `ctx.skills`.
- Give the trusted Web client a generated, typed Remote namespace with explicit expected outcomes.
- Make uploaded archives bounded before publication and make every target-path transition recoverable.
- Preserve strict marketplace ownership so hand-managed skills are never replaced or removed.
- Compose the Host, Remote client assembly, Web settings contribution, and tests through normal plugins.

**Non-Goals:**

- A hosted registry, package download URL, ratings, signing authority, dependency resolver, or automatic update scheduler.
- Installing project-local, preset-local, or bundled skills.
- Executing a skill during validation or trusting archive scripts, permissions, or symbolic links.
- Changing agent-loop, session formats, model requests, prompt projections, or either SDK.
- Supporting old exploratory marketplace manifests or the independent `/skill-market` protocol; the repository is pre-release and rejects obsolete on-disk formats.

## Decisions

### 1. Use a generated Typert Remote namespace over `/api`

The Host package will expose a `TypertRemoteService` namespace named `skillMarket` with `list`, `install`, `banner`, and `uninstall` methods. Its generated `./typert` Host artifact will be registered by the gateway, and its generated `./remote` client contribution will be mounted by `@deepseek-ai/dsh-api-remotes`. The Web package will call `ctx.remote.skillMarket.*`.

Expected business failures will be a closed discriminated union returned by the Remote method, for example `{ ok: false, error: { code: 'managed-upgrade-required', ... } }`. Transport, cancellation, and unexpected implementation failures remain rejected Remote calls. Client-safe request, result, entry, manifest-version, and error types live in the Host package's `./types` export and are re-exported by the Remote assembly, so the browser never imports Host runtime modules.

Alternatives considered:

- Keep an independent `/skill-market` Connection channel. Rejected because it duplicates routing, lifecycle, generation, and error handling already supplied by Typert Remote.
- Extend the generic Connection `RpcError` union. Rejected because marketplace business failures are method outcomes, not carrier failures, and widening the shared carrier couples unrelated APIs.
- Encode details in error messages. Rejected because localization and control flow would depend on parsing prose.

### 2. Separate the Remote gateway from the filesystem transaction engine

The package will have a thin Remote service and an internal transaction engine. The gateway validates the generated wire request, invokes the engine, maps declared domain errors to public outcome variants, and asks the filesystem provider integration to invalidate discovery only after a successful commit. The engine owns archive validation, manifest parsing, locks, staging, rename operations, rollback, and cleanup.

Archive data remains base64 in the JSON Remote request for this first version. The 10 MiB decoded cap bounds its approximately 13.4 MiB base64 representation, which is acceptable for a trusted local Web settings workflow. A future streaming or multipart carrier can replace this request representation without changing installation semantics.

Alternative considered: let the browser extract or write files through filesystem APIs. Rejected because browser parsing is not an authority check and broad filesystem writes would bypass Host ownership and sandbox policy.

### 3. Define one strict bundle grammar

An upload contains either files rooted directly at one skill or one enclosing directory containing the skill. After stripping the optional enclosing directory, `SKILL.md` must be exactly at bundle root. Mixed root files, multiple roots, duplicate normalized paths, empty names, absolute paths, drive or UNC paths, backslashes, NUL bytes, `.` or `..` segments, and non-regular entries are rejected.

`SKILL.md` uses the existing skill frontmatter vocabulary for `name`, `description`, and invocation metadata. Marketplace display fields live under `metadata.marketplace`: optional bounded `version`, `author`, `tags`, and `banner`. The marketplace parser will reuse the owning skill parser or shared schema where possible; marketplace-only fields receive strict schemas with explicit string, item-count, and length limits. Unknown marketplace keys are rejected in version 1 so misspelled security-relevant metadata fails loud.

Alternative considered: infer a skill name from the archive filename or enclosing directory. Rejected because the descriptor is the existing discovery authority and filenames are diagnostic input only.

### 4. Stream validation with fixed security limits

Use the repository's maintained `fflate` dependency and its streaming unzip API. Strict base64 decoding and the 10 MiB decoded archive limit occur before ZIP parsing. Entry headers are counted before decompression; declared uncompressed size is checked when available, and runtime counters enforce the 30 MiB per-entry and total extracted limits even when headers lie. The parser stops accepting data immediately after a limit or structural failure.

No entry is written to its final target during validation. Validated regular files may be buffered within the 30 MiB total cap or streamed into a private staging directory while hashing and counting; either implementation must remove staging on failure and must not follow archive-provided links.

The fixed security invariants are:

- decoded ZIP: 10 MiB;
- regular files: 256;
- one entry after extraction: 30 MiB;
- all entries after extraction: 30 MiB;
- promotional image: 2 MiB.

These are protocol security limits rather than deployment tunables. Changing them requires updating the Host constants, client preflight limit where applicable, docs, and tests together.

Alternative considered: fully extract and inspect afterward. Rejected because a ZIP bomb can consume resources before post-extraction checks run.

### 5. Validate promotional images by path, size, and signature

The banner path is normalized by the same entry-path rules and must name an extracted regular file inside the skill root. Supported formats are PNG, JPEG, WebP, and GIF. Installation checks both extension and magic bytes, rejects mismatches and oversized content, and records only the normalized relative path and validated media type in the management manifest.

The `banner` Remote reopens the managed manifest and file, rechecks containment, regular-file status, size, and signature, then returns base64 bytes and media type. This protects reads after external filesystem modification. SVG is excluded because active or externally referenced content is unnecessary for promotional art.

Alternative considered: return an arbitrary file URL. Rejected because it would expose Host paths and shift content validation to the browser.

### 6. Make the versioned manifest the mutation authority

Each published directory contains `.dsh-market.json` with `schemaVersion: 1`, the exact skill name, normalized display metadata, banner metadata, source filename for diagnostics, and installation timestamp. The public inventory omits the manifest path and other absolute Host paths.

An existing target is managed only when its manifest is a regular file, parses strictly as the supported version, and names the exact target skill. Unknown versions, malformed manifests, missing manifests, and name mismatches are outside this version's mutation authority. Listing omits them; install and uninstall return structured unmanaged or incompatible failures without modifying them.

The implementation may add explicit migration readers in future versions. An older Host never guesses how to mutate a newer manifest.

Alternative considered: treat any directory under the user skill root as marketplace-owned. Rejected because that would allow replacement and recursive deletion of user-authored content.

### 7. Serialize by skill name and publish with sibling renames

Validation that does not depend on target state may start before locking. Before the final ownership check, each install, upgrade, or uninstall acquires an in-process keyed mutex for the normalized skill name. The lock spans final state inspection, commit or detach, rollback, and the success decision. Entries are removed from the lock table when the last waiter leaves.

Staging, backups, and uninstall tombstones are unique siblings on the same filesystem as the configured user skill root. They use marketplace-reserved names outside valid skill-name syntax. A new install writes files and the manifest into staging, fsyncs or closes all writes, verifies staged content, and renames staging to the absent target. An upgrade renames the supported managed target to backup, renames staging to target, restores backup if publication fails, and deletes backup only after publication succeeds. An uninstall renames the supported managed target to a tombstone while locked, reports success after detachment, and removes the tombstone with contained diagnostics.

Startup does not automatically delete arbitrary reserved-looking paths. Cleanup is limited to transaction paths created and retained by the running service; crash-residue recovery is deferred until it can be tied to a durable transaction record.

Alternatives considered:

- Extract directly into the target. Rejected because discovery could observe partial or rejected content.
- Use only optimistic existence checks. Rejected because overlapping upgrades and uninstall can invalidate the check before rename.
- Serialize all marketplace operations globally. Rejected because independent skill names do not share target state.

### 8. Invalidate discovery through the filesystem provider's owned mechanism

`SkillRegistry` intentionally lends invalidation to each registered provider rather than exposing a global `ctx.skills.invalidate()`. The marketplace must therefore integrate with `skill-filesystem` through an explicit provider-owned Host-mutation notification, not an untyped optional method cast.

The preferred implementation is to expose a typed method or event from the filesystem provider that accepts a successfully committed user-skill path and calls its existing `observeHostMutation` logic. The marketplace emits that notification after install, upgrade, or uninstall detaches the target. Existing file watchers remain a fallback observation mechanism, but tests assert the explicit path so behavior does not depend on watcher timing.

Alternative considered: add a public global invalidation method to `SkillRegistry`. Rejected because it would weaken the registration-scoped invalidation ownership used by all providers.

### 9. Build the Web feature as a slot contribution with a cancellable store

The client package will contribute a localized settings navigation item and section through existing slots. A snapshot store owns inventory, search, upload, managed-upgrade confirmation, uninstall confirmation, banner loads, and notices. Components receive the store and translation function through slot injection and remain testable with pure props.

Cards use responsive stable dimensions and repository tokens/CSS Modules. Images load lazily after inventory and use validated `data:` URLs; object URLs or large base64 strings are removed from state after cancellation, replacement, uninstall, or disposal. Each asynchronous operation carries an `AbortSignal` and generation id so a stale response cannot overwrite a newer load. Structured Host codes map to localized copy; unknown infrastructure failures use one localized fallback plus diagnostic logging.

The initial install call omits replacement intent. Only `managed-upgrade-required` opens the upgrade modal and retains the encoded archive until confirm or cancel. Unmanaged and incompatible conflicts display a refusal without an override action. Mutation controls are disabled while their exact operation is pending.

Alternative considered: duplicate Host request and result types in the UI package. Rejected because generated Remote types are the API source of truth.

### 10. Verify the Host and Web assemblies

Host package tests cover strict base64, malformed ZIPs, every path and entry rejection, each resource limit, descriptor and banner validation, manifest compatibility, same-name conflicts, rollback, cleanup, keyed concurrency, and managed-only uninstall. A real Loader-composed test mounts the Typert registry, API gateway dependencies, skill registry, filesystem provider, and marketplace package from a `cordis.yml`, then invokes the generated Remote and observes discovery after mutation.

Client tests cover store transitions, localized error mapping, cancellation, stale responses, component interactions, slots, and responsive metadata rendering. A keyless `apps/web` browser test boots the shipped Web composition against an isolated DSH home and performs list, image, upload, managed upgrade confirmation, and uninstall through the real `/api` transport. Stable accessible output receives the narrow browser fixture or snapshot required by the Web test policy.

Package invariants assert owned registrations and assembly contributions. README and JSDoc document bundle grammar, metadata, limits, ownership, error outcomes, lifecycle, and non-goals. The same change adds an Agent Note for the Remote, on-disk authority, and transaction decisions.

## Risks / Trade-offs

- [Base64 temporarily duplicates archive memory in browser and Host] → Keep the decoded archive at 10 MiB, release client buffers promptly, and leave carrier streaming as a future transport-only improvement.
- [Process crash can leave staging, backup, or tombstone residue] → Use reserved sibling names that discovery cannot treat as skills, never publish partial targets, log cleanup failures, and design a future transaction-record recovery pass before deleting unknown residue.
- [External filesystem edits can invalidate a manifest or banner after install] → Revalidate ownership and banner safety on every mutating or image-read operation and refuse uncertain state.
- [Rename durability differs across filesystems and operating systems] → Resolve transaction paths on the target filesystem, close files before rename, exercise Windows-safe naming in unit tests, and leave the platform matrix to CI.
- [Watcher and explicit invalidation can emit duplicate catalog changes] → Treat invalidation as edge-triggered cache eviction; consumers already refetch authoritative state.
- [Strict version 1 parsing rejects future or externally modified manifests] → Fail closed and require an explicit migration reader before a new Host claims mutation authority.

## Migration Plan

1. Replace the exploratory independent channel and message-parsing types with the Host transaction engine, typed Remote gateway, generated artifacts, and Remote assembly contribution.
2. Introduce `.dsh-market.json` schema version 1 as the only accepted marketplace ownership marker; do not import exploratory manifests.
3. Add the explicit filesystem-provider mutation notification, package wiring, TypeScript aggregate references, and Loader-composed Host test.
4. Replace the exploratory client RPC adapter with `ctx.remote.skillMarket`, then wire the slot contribution into the shipped Web bundle and app dependencies.
5. Add package, assembled browser, documentation, invariant, and Agent Note coverage before enabling the entries in the default Web composition.

Rollback removes the Web and Host plugin entries and package wiring. Skill directories already published with a valid version 1 manifest remain ordinary filesystem-discovered user skills; rollback does not delete user data. Re-enabling the same marketplace version regains management authority.
