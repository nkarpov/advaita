# @nickkarpov/advaita

Owns the user-facing Advaita product surface.

## Current role

This package is now the real published install/launch surface for Advaita:

```bash
npm install -g @nickkarpov/advaita
advaita
```

## What Phase 6 implemented

- `packages/launcher` is the real `@nickkarpov/advaita` package
- ships the `advaita` CLI
- launches the correct forked Pi runtime instead of relying on a global `pi`
- auto-loads the Advaita Pi package/extension
- auto-starts or auto-attaches a local broker for normal local/hosted sessions
- provides `advaita doctor` and `advaita version`
- supports initial product commands:
  - `advaita`
  - `advaita host`
  - `advaita join`
  - `advaita doctor`
  - `advaita version`

## Distribution strategy chosen in Phase 6

Phase 6 chose the **bundle a controlled runtime dependency into Advaita** path.

That means the launcher package pre-packs the exact runtime stack it needs, including:

- the forked `@mariozechner/pi-coding-agent`
- the Advaita broker package
- the Advaita Pi package
- the shared protocol package
- the runtime dependencies required to launch them without depending on whatever happens to be installed globally

## LLM router configuration

The launcher inherits router configuration from the shell environment and passes it through to the managed local broker.

Example:

```bash
export OPENAI_API_KEY=...
export ADVAITA_ROUTER_MODE=auto
export ADVAITA_ROUTER_MODEL=gpt-5.1-codex-mini
advaita doctor
advaita
```

If no router API key is configured, Advaita still works, but routing falls back to heuristics.

## Current validation shape

Typical local validation commands are:

```bash
cd /Users/nickkarpov/advaita
npm run build
node packages/launcher/dist/cli.js doctor
node packages/launcher/dist/cli.js --help
```

And product-install validation can be done by packing/installing `@nickkarpov/advaita` into a temporary prefix and running `advaita doctor`.

## Next phase relationship

- Phase 5 made the Pi package/client real
- Phase 6 turned this package into the real install/launch product surface
- Phase 7 will evolve the auto-started local broker into a longer-lived managed local Advaita node
