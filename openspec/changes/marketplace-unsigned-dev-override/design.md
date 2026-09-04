## Context

Both marketplace services verify Ed25519 publisher signatures at install and at restart-time activation through a module-local `verifyTrust()` call. The Web bundle resolves trusted publishers from launch environment plus the Harness-home file; nothing bypasses verification today.

## Goals / Non-Goals

**Goals:**

- One explicit, default-off configuration makes local marketplace iteration signature-free.
- Every non-trust guarantee — bounded archive, descriptor schema, file table, ownership, atomic publication, credential references — still applies in override mode.

**Non-Goals:**

- No non-Web composition enables the override by default; the Web bundle enables it by default as a pre-release convenience and revisits that default at the first tagged release.
- No UI affordance advertises the override; it is an operator launch choice.
- No weakening of the skill marketplace or any other capability.

## Decisions

### Gate only the two trust call sites per service

Each service gains `allowUnsignedPackages` in its options. Both `verifyTrust()` call sites (install and activation) check it first. Archive and file-table validation stay unconditional: an unsigned package still cannot smuggle undeclared files, unsafe paths, or oversized content, and a later composition without the override rejects the installed package as untrusted.

### The Web switch is launch-environment only

`cordis.patch.yml` wires `allowUnsignedPackages: !!js process.env.DSH_MARKET_ALLOW_UNSIGNED !== '0'`: the pre-release Web bundle defaults to unsigned acceptance for local iteration, and `DSH_MARKET_ALLOW_UNSIGNED=0` restores strict verification on the next composition. The `DSH_` prefix keeps the opt-out out of `.env`, so it is a deliberate per-launch export rather than a checkout-controlled decision. Alternative: a `true` literal with no escape hatch — rejected because strict verification must remain reachable without editing files.

## Risks / Trade-offs

- [An operator leaves the override exported permanently] → the Web README documents it as a development switch, and removing it restores strict verification on the next composition.
- [Unsigned packages accumulate and later fail activation] → that is the designed outcome: trust is re-decided by each composition.

## Migration Plan

Additive configuration with a `false` default; no migration. Rollback removes the config field and wiring.
