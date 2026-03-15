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

## Routing model

Advaita now supports two routing layers inside the broker:

- **LLM routing** for natural-language shared turns
- **heuristic fallback routing** when the router model is unavailable or returns invalid output

The LLM router is a **structured intent classifier**, not a free-form planner.
It decides things like:

- which runtime the user is asking for
- whether that runtime change is **sticky** (`switch to linux`) or **one-turn** (`run this on linux`)
- which model query should be applied on the target runtime
- what cleaned execution text should be passed to the executor

## Pi-native router auth/config

The broker now reuses **Pi's own local auth/model architecture** on the machine hosting the broker.

That means the router model is resolved through the same local Pi state as normal Pi usage:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/models.json`
- Pi OAuth `/login` flows
- Pi provider/model availability rules

So Advaita does **not** require a separate router-specific API key configuration anymore.

## Router environment variables

The local broker process reads these variables at startup:

```bash
ADVAITA_ROUTER_MODE=auto              # auto | heuristic | pi
ADVAITA_ROUTER_MODEL=gpt-5.1-codex-mini
```

Behavior:

- `ADVAITA_ROUTER_MODE=heuristic` forces the old deterministic parser only
- `ADVAITA_ROUTER_MODE=auto` uses the Pi-backed router model when it is available locally, otherwise heuristic routing
- `ADVAITA_ROUTER_MODE=pi` prefers the Pi-backed router model, but still falls back to heuristics on failure
- `ADVAITA_ROUTER_MODEL` is a **Pi-style model query**, not a separate API key setting

Example:

- if the broker host has a Pi-authenticated `openai-codex/gpt-5.1-codex-mini` available locally, the router uses it
- if not, the broker falls back to heuristics and continues working

The broker CLI prints the active router status on startup.
