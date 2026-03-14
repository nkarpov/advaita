# @advaita/shared

Shared protocol, routing, and type contracts for Advaita V2.

## What lives here

- runtime routing parser
- model-query extraction
- combined turn-routing intent helpers
- broker/client wire protocol envelopes
- canonical shared session/presence/model-state types

## Design intent

This package is the contract layer between:

- the thin Advaita broker
- the Advaita Pi package/extension
- future integration tests and fixtures

It is intentionally built around the new forked-Pi seams:

- synchronized session snapshots/entries
- live remote `AgentSessionEvent` streaming
- runtime-local sticky model state

## Key files

- `src/types.ts`
- `src/runtime-routing.ts`
- `src/model-routing.ts`
- `src/turn-routing.ts`
- `src/protocol.ts`
