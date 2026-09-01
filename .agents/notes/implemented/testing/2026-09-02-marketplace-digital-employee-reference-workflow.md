# Agent Note: Marketplace digital employee reference workflow

Status: implemented

English | [中文](2026-09-02-marketplace-digital-employee-reference-workflow.zh.md)

## Problem

Skill, Tool, and MCP marketplaces have different trust, activation, and credential rules. Separate package tests cannot prove that an administrator can install all three asset kinds, restart the Host, publish one template, create an employee, and exercise only the selected capabilities through the production `@` chat path. A browser-only scenario would make archive security and runtime attribution failures expensive to diagnose.

## Decision

The repository owns three deterministic installable examples: `marketplace-test-skill`, the signed Tool package that registers `marketplace_test_echo`, and the declarative `marketplace-test-mcp` package. Author templates remain separate downloads with placeholders and signing guidance. The Tool example uses a fixed test-only Ed25519 publisher; production trust stays empty unless a development or test configuration explicitly supplies that public key. The private key is generation-only fixture material and is never loaded by the marketplace runtime.

The MCP example declares `MARKETPLACE_TEST_MCP_ENDPOINT` and `MARKETPLACE_TEST_MCP_TOKEN` references. Web and assembled tests resolve the endpoint to an ephemeral loopback Streamable HTTP server and resolve the credential through the ordinary credential provider. Installed package data, configuration drafts, catalog projections, Session events, and audit records contain reference names but not the resolved credential value. Credential-owned headers are omitted from the fixed-header projection.

Tool and MCP installation remains restart-bound. The Web scaffold preserves one temporary Harness Home across a clean Host stop and relaunch, while every lifecycle owns an isolated configuration-studio file, employee store, marketplace roots, credentials, and Skill roots. This proves persistence across the intended restart without importing developer state.

Verification is divided by ownership. Focused package tests validate archives, signatures, production-default trust rejection, endpoint and credential references, deterministic Tool and MCP responses, catalog correlation, template validation, and employee authority. The headless keyless snapshot owns model-visible composition, calls, denial of an installed but undeclared Skill, durable Session evidence, and audit attribution. Web E2E owns the user journey from downloads and uploads through restart, template publication, employee activation, leading `@` selection, completed conversation, and retained employee ownership.

## Alternatives considered

**Use author templates as installable examples.** Placeholder identities and signatures are appropriate for authoring guidance but cannot be installed unchanged or safely reused as fixture identities.

**Trust the example publisher by default.** Distribution proves repository ownership of the fixture, not deployment authorization to execute that publisher's packages. Explicit test configuration keeps production trust unchanged.

**Embed an MCP URL or credential value in the archive.** A fixed external URL makes the workflow network-dependent, while an embedded credential creates a second secret-storage path. References preserve offline determinism and Host ownership.

**Cover the workflow only in the browser.** Browser failures would conflate archive validation, restart activation, runtime composition, and attribution. Focused tests and the assembled snapshot keep each failure local while Web E2E proves the real administrator path.

## Consequences

Contributors have one reproducible, keyless reference workflow for all three marketplaces and digital employee composition. The examples are test assets rather than third-party compatibility promises. Tool execution requires explicit test publisher trust, Tool and MCP activation costs a real Host restart, and the MCP fixture requires endpoint and credential reference configuration. The layered tests add maintenance across package, snapshot, and browser suites, but each layer verifies behavior only it can authoritatively observe.
