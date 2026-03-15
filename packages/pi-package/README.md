# @advaita/pi-package

Advaita's runtime integration layer for the local coding-agent UI.

## Role

This package is not the primary end-user entrypoint anymore. End users should install and run:

```bash
npm install -g @nickkarpov/advaita
advaita
```

The launcher owns runtime resolution and process startup. This package owns the in-session shared-runtime behavior.

## Responsibilities

- connect the local runtime to the Advaita broker
- intercept shared free-text submit before local execution
- keep local-only commands like `/login`, `/logout`, and `!` local
- hydrate broker snapshots and committed entries into the local session
- render foreign streamed events live through Pi-native UI seams
- execute assigned turns locally from synchronized state
- publish presence, typing, and runtime-local model state
- show runtime/session UI, notices, and runtime picker behavior inside the TUI

## Current in-session UX

The current build includes:

- current/local runtime header above the input
- pre-execution **Attuning...** state
- durable transcript notices for joins, routing, runtime switches, and model changes
- `Ctrl+R` runtime picker
- `/advaita-invite`
- `/advaita-debug`
- `/runtime <runtimeId>`

## Manual low-level development launch

If you are working directly on this layer, you can still launch it manually with the forked runtime:

```bash
cd /Users/nickkarpov/pi-mono
node packages/coding-agent/dist/cli.js \
  -e /Users/nickkarpov/advaita/packages/pi-package \
  --advaita-url ws://127.0.0.1:7171 \
  --advaita-session demo \
  --advaita-runtime mac
```

Do **not** use an older unrelated global `pi` binary here. Advaita depends on fork-only APIs such as `replaceSessionContents()`, `importSessionEntries()`, and `continueSession()`.

## Known limitations

- shared image turns are not supported yet
- `/new`, `/resume`, `/tree`, and `/fork` remain blocked while connected
- queued-turn transcript semantics still need more polish
- pure remote model-switch-only control turns are not done yet
