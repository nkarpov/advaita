# @advaita/broker

Thin canonical broker/router for Advaita V2.

## Responsibilities

- canonical shared session ordering
- runtime routing
- presence and typing fanout
- live streamed foreign-turn event fanout
- reconnect/bootstrap snapshots
- turn assignment, commit, requeue, and executor tracking

## Design rule

The broker owns transport, ordering, and coordination.

It does **not** own:

- local Pi auth
- local provider availability
- local model registries
- local extension/theme/settings behavior

Those stay on each runtime in real Pi.
