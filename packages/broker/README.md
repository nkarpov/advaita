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
- **heuristic fallback routing** when the LLM router is unavailable or returns invalid output

The LLM router is a **structured intent classifier**, not a free-form planner.
It decides things like:

- which runtime the user is asking for
- whether that runtime change is **sticky** (`switch to linux`) or **one-turn** (`run this on linux`)
- which model query should be applied on the target runtime
- what cleaned execution text should be passed to the executor

## Router environment variables

The local broker process reads these variables at startup:

```bash
ADVAITA_ROUTER_MODE=auto              # auto | heuristic | openai
ADVAITA_ROUTER_MODEL=gpt-5.1-codex-mini
ADVAITA_ROUTER_OPENAI_API_KEY=...     # optional; falls back to OPENAI_API_KEY
ADVAITA_ROUTER_BASE_URL=https://api.openai.com/v1
```

Behavior:

- `ADVAITA_ROUTER_MODE=heuristic` forces the old deterministic parser only
- `ADVAITA_ROUTER_MODE=auto` uses the OpenAI router when an API key is present, otherwise heuristic routing
- `ADVAITA_ROUTER_MODE=openai` also uses the OpenAI router, but still falls back to heuristics if the router call fails

The broker CLI now prints the active router mode on startup.
