# Advaita

Advaita V2 is the clean implementation of a **Pi-native multiplayer coding agent**.

Active work now lives in:

- `/Users/nickkarpov/advaita`
- `/Users/nickkarpov/pi-mono`

Reference-only prototype history lives in:

- `/Users/nickkarpov/ws/advaita`

## Phase 0 status

Phase 0 is complete when this workspace exists as the new source of truth for V2, the old prototype is frozen as a historical reference, and the package/notes layout is ready for implementation.

Current status:

- legacy prototype checkpoint tagged in `/Users/nickkarpov/ws/advaita` as `legacy-prototype`
- clean V2 workspace created at `/Users/nickkarpov/advaita`
- package roots created under `packages/`
- architecture and migration notes created under `README.md` and `notes/`

## Product direction

Advaita V2 is built around:

- a **thin broker/router**
- a **real long-lived Pi runtime on each machine**
- an **Advaita Pi package/extension** for multiplayer behavior
- a **small Advaita-maintained Pi fork** for missing generic APIs

The main user experience goal is:

- each machine feels like **real Pi**
- local Pi concerns stay local (`/login`, `/logout`, auth, model availability, settings)
- shared turns are routed by the broker
- remote execution is rendered **live**, streamed incrementally, and feels like it is happening locally

## Core runtime model

### Local Pi owns

- local auth
- local model availability
- local sticky runtime model state
- local cwd/environment
- local session/runtime behavior
- local theme/extensions/settings

### Advaita broker owns

- turn routing
- canonical shared transcript ordering
- runtime-local model assignments across machines
- presence/typing
- reconnect/bootstrap snapshots when needed
- live fanout of in-flight remote Pi events during active turns

### Pi fork owns only generic seams

- session hydration/import APIs
- external event rendering APIs
- any other small generic abstractions required to connect real Pi to shared session replication

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
Thin canonical broker/router for routing, ordering, fanout, reconnect, and presence.

### `packages/pi-package`
The main Advaita Pi package/extension that intercepts shared submit, talks to the broker, keeps local runtime state in sync, and renders live remote execution.

### `packages/launcher`
Small local bootstrap/launcher surface for running Advaita in a repeatable way.

### `packages/integration-tests`
Cross-runtime and cross-machine integration fixtures, replay tests, and multi-client validation.

## Reference policy

`/Users/nickkarpov/ws/advaita` is now reference-only.

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

## Next step after Phase 1

Phase 2 adds the generic session import/rendering seams to our Pi fork.
