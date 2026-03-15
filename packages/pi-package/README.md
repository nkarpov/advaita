# @advaita/pi-package

Advaita Pi package/extension.

## Important positioning

This package is the real multiplayer Pi client layer, but it is **not** meant to be the long-term end-user entrypoint.

Today it is still launched directly during development.

The intended product direction is:

```bash
npm install -g @nkarpov/advaita
advaita
```

So Phase 6 should make this package mostly an internal implementation detail behind the Advaita launcher.

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

## Current development bootstrap

Start the broker:

```bash
cd /Users/nickkarpov/advaita
npm --workspace @advaita/broker run build
npm --workspace @advaita/broker run start -- --host 127.0.0.1 --port 7171 --data-dir /tmp/advaita-broker
```

Then launch the **forked Pi runtime** with the package:

```bash
cd /Users/nickkarpov/pi-mono
node packages/coding-agent/dist/cli.js \
  -e /Users/nickkarpov/advaita/packages/pi-package \
  --advaita-url ws://127.0.0.1:7171 \
  --advaita-session demo \
  --advaita-runtime mac
```

Do **not** use an older globally installed `pi` binary here. Advaita Phase 5 depends on fork-only extension APIs such as `replaceSessionContents()`, `importSessionEntries()`, and `continueSession()`.

## Current limitations

- shared image turns are not supported yet
- `/new`, `/resume`, `/tree`, and `/fork` are blocked while connected
- footer/status is implemented via Pi footer status text first; richer shared widgets can come later
- the current launch flow is still development-oriented and will be hidden behind the launcher in Phase 6
