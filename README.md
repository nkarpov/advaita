# Advaita

Advaita V2 is the clean implementation of a **Pi-native multiplayer coding agent**.

Active work now lives in:

- `/Users/nickkarpov/advaita`
- `/Users/nickkarpov/pi-mono`

Reference-only prototype history lives in:

- `/Users/nickkarpov/ws/advaita`

## Product direction

Advaita should stop feeling like "Pi + a separate broker + local checkout glue" and start feeling like a real product.

The intended install and launch surface is:

```bash
npm install -g @nickkarpov/advaita
advaita
```

That implies a few concrete product rules:

- users should run **`advaita`**, not manually invoke `pi`
- users should **not** manually start a broker
- Advaita should own the **exact Pi runtime version** it needs instead of depending on whatever `pi` is in `PATH`
- the Advaita Pi package should become an **implementation detail**, not the primary user entrypoint
- the broker should feel **embedded from the user point of view**, even if we manage it as a separate local process for resiliency

## Core architecture direction

Advaita V2 is built around:

- a **real Pi runtime on each machine**
- an **Advaita Pi package/extension** for multiplayer behavior
- a **thin broker/router** today
- a **managed local Advaita node** next
- a **small Advaita-maintained Pi fork** for missing generic APIs only

The main user experience goal remains:

- each machine feels like **real Pi**
- local Pi concerns stay local (`/login`, `/logout`, auth, model availability, settings)
- shared turns are routed through Advaita
- remote execution is rendered **live** and feels local
- eventually, each Advaita install has local broker/node capability so the system can survive losing any one machine

## Core runtime model

### Local Pi owns

- local auth
- local model availability
- local sticky runtime model state
- local cwd/environment
- local session/runtime behavior
- local theme/extensions/settings

### Advaita broker/node owns

- turn routing
- canonical shared transcript ordering
- runtime-local model assignments across machines
- presence/typing
- reconnect/bootstrap snapshots when needed
- live fanout of in-flight remote Pi events during active turns
- later: node lifecycle, peer replication, and failover

### Pi fork owns only generic seams

- session hydration/import APIs
- external event rendering APIs
- continuation/sync helpers needed to connect real Pi to shared session replication

## Workspace layout

```text
/Users/nickkarpov/advaita/
├─ README.md
├─ TODO.md
├─ package.json
├─ packages/
│  ├─ broker/
│  ├─ shared/
│  ├─ pi-package/
│  ├─ launcher/
│  └─ integration-tests/
└─ notes/
   ├─ command-classification.md
   ├─ local-dev-workflow.md
   ├─ migration-plan.md
   └─ pi-fork-api-gap.md
```

## Package intent

### `packages/shared`
Shared protocol, routing parsers, canonical types, and transport contracts.

### `packages/broker`
Thin broker/router implementation used today as the canonical authority and later as the basis for managed local node behavior.

### `packages/pi-package`
The Advaita Pi package/extension that intercepts shared submit, talks to the broker, keeps local runtime state in sync, and renders live remote execution.

### `packages/launcher`
The real **published product surface**: the `advaita` binary, install/bootstrap flow, Pi runtime ownership, and current broker lifecycle management that later grows into managed local node behavior.

### `packages/integration-tests`
Cross-runtime and cross-machine integration fixtures, replay tests, and multi-client validation.

## Current phase checkpoint

Phase 6 is complete in Advaita.

What now exists:

- `packages/launcher` is the real `@nickkarpov/advaita` package
- `advaita` is the real product CLI entrypoint
- Advaita launches the correct forked Pi runtime instead of trusting global `pi`
- the Advaita Pi package is auto-loaded by the launcher
- local broker startup/attach is automatic for normal local/hosted use
- `advaita doctor` and `advaita version` exist
- `advaita`, `advaita host`, and `advaita join` exist

Phase 6 also chose the current distribution strategy:

- **bundle a controlled runtime dependency into Advaita**

That means the packed/published `@nickkarpov/advaita` artifact bundles the forked Pi runtime and the Advaita runtime packages it depends on, instead of relying on ambient global installs.

## Next phases

### Phase 7 — Managed local node

Make the broker feel embedded while improving resilience:

- local managed node/service process
- TUI attaches to that node
- node can outlive the foreground TUI
- no manual broker lifecycle for users

### Phase 8 — Replicated session authority

Evolve from one canonical broker to a replicated multi-node model:

- each Advaita install has node/broker capability
- canonical session state is replicated
- leader/authority can move when a machine disappears
- shutting down any one machine should not kill the session

## Reference policy

`/Users/nickkarpov/ws/advaita` is reference-only.

Use it for:

- broker/protocol learnings
- routing/model parsing learnings
- docs/test ideas
- migration reference

Do not use it as the architectural base for V2.

## Fork policy

Pi development for Advaita happens against:

- `/Users/nickkarpov/pi-mono`

Advaita's Pi dependency source is **our fork**.

That means any `@mariozechner/pi-*` package used by Advaita should come from our forked checkout/release line, not upstream.

Remote policy:

- `origin` = our fork
- `upstream` = real Pi repo
- do not open PRs to upstream from this workstream

See:

- `notes/local-dev-workflow.md`
