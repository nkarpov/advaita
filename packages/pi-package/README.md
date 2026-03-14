# @advaita/pi-package

Advaita Pi package/extension.

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

## Current flag-based bootstrap

Start the broker:

```bash
cd /Users/nickkarpov/advaita
npm --workspace @advaita/broker run build
npm --workspace @advaita/broker run start -- --host 127.0.0.1 --port 7171 --data-dir /tmp/advaita-broker
```

Then launch Pi with the package:

```bash
pi \
  -e /Users/nickkarpov/advaita/packages/pi-package \
  --advaita-url ws://127.0.0.1:7171 \
  --advaita-session demo \
  --advaita-runtime mac
```

## Current limitations

- shared image turns are not supported yet
- `/new`, `/resume`, `/tree`, and `/fork` are blocked while connected
- footer/status is implemented via Pi footer status text first; richer shared widgets can come later
