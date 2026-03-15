# @advaita/pi-package

Advaita Pi package/extension.

## Positioning after Phase 6

This package is the real multiplayer Pi client layer, but after Phase 6 it is no longer the primary end-user entrypoint.

End users should go through:

```bash
npm install -g @nickkarpov/advaita
advaita
```

The launcher now owns:

- the `advaita` command
- the forked Pi runtime it launches
- auto-loading this package
- local broker startup/attach for current single-node use

This package remains the right place for multiplayer Pi client behavior itself.

## Responsibilities

- connect a real Pi session to the Advaita broker
- intercept shared free-text submit before local execution
- leave local Pi commands like `/login`, `/logout`, and `!` bash local
- sync broker snapshots and committed entries into the local Pi session
- render foreign live turns through Pi-native UI hooks from our fork
- execute assigned turns locally via real Pi continuation
- publish local presence, typing, and runtime-local model state

## Current commands

- `/advaita-connect <ws-url> <session> [runtimeId]`
- `/advaita-disconnect`
- `/advaita-debug`
- `/route-debug`
- `/runtime <runtimeId>`

## Current low-level development bootstrap

If you are working directly on the Pi package/client layer, you can still launch it with the forked Pi runtime manually:

```bash
cd /Users/nickkarpov/pi-mono
node packages/coding-agent/dist/cli.js \
  -e /Users/nickkarpov/advaita/packages/pi-package \
  --advaita-url ws://127.0.0.1:7171 \
  --advaita-session demo \
  --advaita-runtime mac
```

Do **not** use an older globally installed `pi` binary here. Advaita depends on fork-only extension APIs such as `replaceSessionContents()`, `importSessionEntries()`, and `continueSession()`.

## Current limitations

- shared image turns are not supported yet
- `/new`, `/resume`, `/tree`, and `/fork` are blocked while connected
- footer/status is implemented via Pi footer status text first; richer shared widgets can come later
- richer shared-session command semantics still continue in later phases
