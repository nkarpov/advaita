# Command Classification

This file defines which commands stay purely local Pi behavior and which commands Advaita intercepts/brokers.

Created in Phase 0 as a scaffold. Final classification is refined in later phases.

## Local-only commands

These should continue to work as normal Pi commands on each machine:

- `/login`
- `/logout`
- local provider/model setup
- `/reload`
- `/hotkeys`
- `/changelog`
- `/debug`
- likely parts of `/settings`
- likely local `/model` initially

## Shared / brokered commands

These should be owned by Advaita semantics:

- normal free-text shared submit
- `/runtime`
- `/advaita-debug`
- `/route-debug`
- future explicit remote-model control, if needed

## Deferred commands

These need explicit shared semantics before they are enabled:

- `/new`
- `/tree`
- `/fork`
- `/resume`

## Guiding rule

If the command affects local auth, local provider access, or local Pi configuration, keep it local.

If the command affects shared turn routing, shared transcript semantics, or cross-runtime coordination, it belongs to Advaita.
