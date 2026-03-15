# @advaita/launcher

Owns the user-facing Advaita product surface.

## Target role

This package is intended to become the published install surface:

```bash
npm install -g @nkarpov/advaita
advaita
```

## Planned responsibilities

- provide the `advaita` CLI
- own version/runtime checks and `advaita doctor`
- launch the correct forked Pi runtime instead of relying on a random global `pi`
- auto-load the Advaita Pi package/extension
- auto-start or auto-attach the local Advaita broker/node
- make the broker feel embedded from the user's point of view
- later, manage attachment to a long-lived local node/service process

## Phase relationship

- Phase 5 made the Pi package/client real
- Phase 6 turns this package into the real install/launch product surface
- Phase 7 expands it to manage a local Advaita node lifecycle
