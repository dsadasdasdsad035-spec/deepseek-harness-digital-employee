# Agent Note: Deterministic Typert union order

Status: implemented

English | [中文](2026-09-01-deterministic-typert-union-order.zh.md)

## Problem

TypeScript can return equivalent union members in different orders across independently created Programs. Typert emitted that incidental order into generated Zod schemas, so a build and a later freshness test could disagree without any source change.

## Decision

Remote-codec analysis sorts union members by their complete TypeScript text before converting them into Typert nodes. Authored syntax-tree unions retain source order, and intersections retain TypeScript's order.

## Alternatives considered

Sorting every union would make authored schemas less readable by discarding deliberate source order. Persisting TypeScript's incidental checker order would leave generated artifacts nondeterministic across independently created Programs.

## Consequences

Repeated generation produces byte-identical Host and Remote artifacts for equivalent unions. The generated order is an encoding choice only; runtime validation accepts the same union members.
