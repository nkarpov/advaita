# Migration Plan

## Goal

Build Advaita V2 in `/Users/nickkarpov/advaita` while keeping the existing prototype in `/Users/nickkarpov/ws/advaita` as a frozen reference.

## Reference checkpoint

The legacy prototype is frozen at:

- repo: `/Users/nickkarpov/ws/advaita`
- tag: `legacy-prototype`
- tagged commit: `9952a8284cc63751d6e35102e23cc80ed7ec099b`

This checkpoint is the historical baseline for V2 migration work.

## Reference-only assets from the old prototype

Use the old prototype for architecture/test/reference only.

### Key code references

- `src/server/broker.ts`
- `src/server/session-store.ts`
- `src/client/app.ts`
- `src/client/turn-controller.ts`
- `src/client/pi-engine.ts`
- `src/client/advaita-interactive-mode.ts`
- `src/client/pi-ui-adapter.ts`
- `src/client/pi-session-hydrator.ts`
- `src/client/pi-event-adapter.ts`
- `src/client/local-model-manager.ts`
- `src/shared/protocol.ts`
- `src/shared/advaita-turn.ts`
- `src/shared/runtime-routing.ts`
- `src/shared/model-routing.ts`

### Key docs references

- `README.md`
- `TODO.md`
- `docs/architecture.md`
- `docs/client-architecture.md`
- `docs/compatibility-contract.md`
- `docs/pi-native-ui-plan.md`

### Key tests/reliability references

- `src/server/broker.test.ts`
- `src/server/session-store.test.ts`
- `src/client/pi-event-adapter.test.ts`
- `src/client/pi-session-hydrator.test.ts`
- `src/shared/runtime-routing.test.ts`
- `src/shared/model-routing.test.ts`
- `src/smoke/run-smoke.ts`

## Migration rules

1. New architecture work happens in `/Users/nickkarpov/advaita`.
2. Pi fork work happens in `/Users/nickkarpov/pi-mono`.
3. The old prototype remains a reference source, not the implementation foundation.
4. Reuse ideas, tests, and parsers deliberately; do not drag forward accidental architecture.
5. Keep the fork surface generic and small.

## Intended migration order

1. Phase 0: establish the clean V2 workspace
2. Phase 1: wire Advaita against the existing Pi fork
3. Phase 2: add generic session import/rendering APIs to the fork
4. Phase 3+: rebuild shared protocol, thin broker, and Pi package on the new architecture

## Parity checklist to retire the prototype later

- shared submit routed through broker
- runtime routing
- runtime-local sticky model routing
- presence/typing
- reconnect/bootstrap sync
- live remote event streaming into mirrors
- local `/login` and `/logout` preserved
- Pi-native passive rendering of foreign turns
