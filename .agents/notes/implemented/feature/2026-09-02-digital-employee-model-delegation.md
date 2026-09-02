# Agent Note: Digital employee model delegation

Status: implemented

English | [中文](2026-09-02-digital-employee-model-delegation.zh.md)

## Problem

The Web chat could create a digital employee Agent and the Core service could delegate to named experts, but the model had no scoped tool that connected those two surfaces.

## Decision

`DigitalEmployeeAgent.compose()` registers `delegate_to_expert` in the current Agent's tools registry only when the resolved employee has experts. The tool captures the resolved employee composition, uses the current tool caller as the parent Agent, selects the Host-registered `spawn` provider (or the first available provider), and calls the existing `delegateToExpert()` service. Expert resolution, authority intersection, child composition, MCP mounting, Session events, and lifecycle cleanup remain owned by the Core service.

The tool is registered even when no provider is currently available. Execution then fails with the existing provider diagnostic instead of silently removing the model-visible capability from an otherwise valid employee composition.

## Alternatives considered

Registering the expert operation in the Host composition was rejected because it would expose one shared tool outside the employee Agent scope and could not select the active employee's authorized expert catalog. Replacing the existing subagent runtime was rejected because it would duplicate child lifecycle, authority, and continuation logic.

## Consequences

Expert delegation is Agent-scoped and cannot expose another employee's expert catalog. Existing ordinary `subagent` tools remain separately controlled by preset composition; enabling them in Web still requires an assembled preset decision and end-to-end coverage.
