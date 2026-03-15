# Advaita V2 TODO

## Product thesis

Advaita should stop feeling like a hand-assembled stack of:

- a local Pi checkout
- a separately started broker
- a manually loaded extension
- and a fragile dependency on whatever `pi` binary happens to be in `PATH`

The product surface should become:

```bash
npm install -g @nkarpov/advaita
advaita
```

From that point forward, Advaita should own:

- the launcher users invoke
- the Pi runtime version it depends on
- the Advaita Pi package wiring
- local node/broker lifecycle
- later, replicated session authority across machines

The point is still to reuse **real Pi** as the local runtime/UI/session system while moving multiplayer/session transport into Advaita.

---

## Core architecture direction

Advaita V2 is built around:

- a **real Pi runtime on each machine**
- an **Advaita Pi package/extension** that owns most multiplayer behavior
- a **thin broker/router** today
- a **managed local Advaita node** next
- a **small Advaita-maintained Pi fork** for the generic abstractions Pi does not yet expose publicly

Local Pi should continue to own:

- `/login`
- `/logout`
- local auth credentials
- local model availability
- local sticky model state
- local settings/themes/extensions
- local cwd/environment
- local session runtime state

Advaita should own:

- canonical shared transcript ordering
- runtime routing
- runtime-local model requests across machines
- presence/typing
- live streaming fanout of in-flight Pi events during active turns
- reconnect/bootstrap sync
- later: local node management, peer replication, and failover

Only the following should live in the Pi fork:

- generic session sync/hydration APIs
- generic imported-entry APIs
- generic external event rendering APIs
- other small generic seams required to connect Pi cleanly to shared session replication

---

## Current state after Phase 5

What is already real:

- `@advaita/shared`
- `@advaita/broker`
- `@advaita/pi-package`
- the forked Pi sync/render/continue APIs in `/Users/nickkarpov/pi-mono`

What is still not productized:

- users still have to think about the broker as a separate thing
- users still have to think about the Pi package as a separate thing
- users can still accidentally run the wrong `pi` binary
- the current manual path still feels like a development harness, not a product install

So the next work is explicitly about **productization first**, then **managed local node lifecycle**, then **replicated authority/failover**.

---

## Fresh implementation layout

```text
/Users/nickkarpov/advaita/
├─ TODO.md
├─ README.md
├─ packages/
│  ├─ broker/            # routing/order/fanout/session authority implementation
│  ├─ shared/            # protocol, routing parsers, shared types
│  ├─ pi-package/        # Advaita Pi extension/package
│  ├─ launcher/          # future published @nkarpov/advaita entrypoint
│  └─ integration-tests/ # multi-runtime tests and fixtures
└─ notes/
   ├─ pi-fork-api-gap.md
   ├─ command-classification.md
   ├─ local-dev-workflow.md
   └─ migration-plan.md
```

The existing prototype at `/Users/nickkarpov/ws/advaita` remains **reference-only**.

---

## End-to-end phase plan

## Phase 0 — Freeze the current prototype and create the clean workspace

- [x] Tag the current implementation as `legacy-prototype`
- [x] Treat `/Users/nickkarpov/ws/advaita` as reference only
- [x] Create the clean V2 package roots under `/Users/nickkarpov/advaita/packages/`
- [x] Preserve current docs/tests as historical reference while building V2 separately

## Phase 1 — Wire local development against the existing Pi fork

- [x] Verify the local fork checkout at `/Users/nickkarpov/pi-mono`
- [x] Verify `origin` points at our fork and `upstream` points at the real Pi repo
- [x] Document local development against forked Pi packages
- [x] Verify we can run stock Pi from our fork before Advaita-specific changes
- [x] Create `advaita/main` in the fork for our generic API work

## Phase 2 — Implement the minimal generic APIs in the Pi fork

- [x] Add public session replacement/hydration API
- [x] Add public imported-entry append API
- [x] Add public external-event rendering API for InteractiveMode
- [x] Add extension-facing wrappers for the above APIs
- [x] Add a continuation helper for executing from already-synced state
- [x] Keep all fork changes generic and independently reviewable

## Phase 3 — Build the shared package layer in Advaita V2

- [x] Implement `packages/shared` for protocol/types/routing helpers
- [x] Move runtime routing parser into V2 shared package
- [x] Move model-query parsing into V2 shared package
- [x] Define the broker protocol for hello/presence/submit/assignment/stream/commit/snapshot
- [x] Explicitly model runtime-local sticky model state in shared types

## Phase 4 — Rebuild the broker as a thin canonical authority

- [x] Implement a new thin broker package instead of piling more onto the legacy broker
- [x] Keep the broker authoritative for ordering, queueing, routing, and fanout only
- [x] Make live turn fanout incremental/event-stream-based
- [x] Remove broker ownership of local auth semantics
- [x] Support reconnect snapshot sync for late joiners/new replicas

## Phase 5 — Build the Advaita Pi package/extension as the main client layer

- [x] Create `packages/pi-package` as the real local client behavior package
- [x] Open broker connection on `session_start`
- [x] Intercept shared-turn submission with Pi `input`
- [x] Keep local Pi commands local unless explicitly shared
- [x] Add shared status/footer/debug surfaces
- [x] Stream local in-flight Pi events to the broker during assigned turns
- [x] Import committed entries and render foreign streamed events through Pi-native seams
- [x] Execute assigned turns locally from synchronized Pi state

## Phase 6 — Product launcher & installer

Turn Advaita into a single installable product surface.

### Packaging and runtime ownership

- [ ] Make `packages/launcher` the real publishable `@nkarpov/advaita` package
- [ ] Ship an `advaita` binary as the primary user entrypoint
- [ ] Stop depending on an ambient global `pi` binary in `PATH`
- [ ] Decide and implement the fork distribution strategy for product installs:
  - [ ] publish forked Pi runtime packages under our scope/release line, or
  - [ ] bundle a controlled runtime dependency into Advaita
- [ ] Ensure Advaita always launches the exact forked Pi runtime version it requires
- [ ] Make `packages/pi-package` an implementation detail for end users instead of a manual launch detail

### Launcher behavior

- [ ] Launch the correct Pi runtime programmatically or as a managed child process
- [ ] Auto-load the Advaita Pi package/extension
- [ ] Auto-start or auto-attach a local broker/node instead of asking users to run one manually
- [ ] Add `advaita doctor` to detect bad runtime/version/path/config states
- [ ] Add `advaita version` / install diagnostics
- [ ] Define the initial product UX for:
  - [ ] `advaita`
  - [ ] `advaita host`
  - [ ] `advaita join`
  - [ ] `advaita doctor`

### Phase 6 acceptance signal

- [ ] A fresh machine can install Advaita and launch a working local session with a single user-facing command
- [ ] No manual broker startup is required
- [ ] No manual `pi -e ...` invocation is required
- [ ] Running the wrong global `pi` binary is no longer a failure mode for normal users

## Phase 7 — Managed local Advaita node

Make the broker feel embedded while improving resilience and lifecycle management.

### Local node model

- [ ] Introduce the concept of a local Advaita node/service per machine
- [ ] Keep the embedded UX, but prefer a managed sidecar/daemon over a single all-in-one foreground process
- [ ] Let the TUI attach to the local node instead of owning the node lifecycle directly
- [ ] Let the local node outlive foreground TUI restarts/crashes when appropriate
- [ ] Persist local node state/session cache in a stable location

### Local broker/service behavior

- [ ] Make the local broker/node automatically started and supervised by the launcher
- [ ] Support re-attaching a new TUI to an already-running local node
- [ ] Add basic node management surfaces such as:
  - [ ] `advaita node status`
  - [ ] `advaita node stop`
  - [ ] local logs/diagnostics
- [ ] Keep the current centralized broker behavior available as the single-node implementation underneath

### Phase 7 acceptance signal

- [ ] Closing or restarting the foreground TUI does not necessarily kill the local Advaita node
- [ ] Users still experience Advaita as "one app", not as a separate broker they must manage

## Phase 8 — Replicated session authority and failover

Evolve from a single canonical broker to a replicated multi-node model.

### Replication model

- [ ] Give every Advaita install local node/broker capability
- [ ] Replicate canonical session state/log across nodes
- [ ] Define the authority model:
  - [ ] leader election, or
  - [ ] lease-based primary authority
- [ ] Support authority handoff when the current leader disappears
- [ ] Preserve canonical ordering and turn-assignment correctness through failover

### Failure handling

- [ ] Define what happens when a node dies:
  - [ ] while idle
  - [ ] while mirrored only
  - [ ] while executing the active turn
  - [ ] while acting as authority
- [ ] Requeue or recover active turns cleanly after node loss
- [ ] Support reconnect/catch-up from replicated log + snapshot/bootstrap
- [ ] Ensure shutting down any single machine does not kill the session

### Phase 8 acceptance signal

- [ ] Any one machine can disappear and the session continues from another node
- [ ] Session authority is no longer tied to one manually chosen broker host

## Phase 9 — Shared command semantics and runtime-local controls

These are still important, but they now sit behind the product/node work instead of being the immediate next phase.

### Command classification

- [ ] Finalize `notes/command-classification.md`
- [ ] Define **local-only** commands that should remain ordinary Pi behavior
- [ ] Define **shared/brokered** commands that Advaita intercepts
- [ ] Define **deferred** commands that need explicit shared semantics before enabling

### Expected local-only commands

- [ ] `/login`
- [ ] `/logout`
- [ ] local provider/model availability setup
- [ ] `/reload`
- [ ] `/hotkeys`
- [ ] `/changelog`
- [ ] likely parts of `/settings`
- [ ] likely local `/model` until a better shared story exists

### Deferred shared-session commands

- [ ] `/new`
- [ ] `/tree`
- [ ] `/fork`
- [ ] `/resume`

### Runtime-local controls

- [ ] Keep sticky model state local to each runtime, not global to the session
- [ ] Let one runtime request another runtime switch models through Advaita
- [ ] Ensure remote model switch occurs before assigned turn execution
- [ ] Decide whether `/model` remains purely local in the product initially
- [ ] Extend the same model to other runtime-local controls later, such as thinking level

## Phase 10 — Pi-native polish, testing, and cutover

- [ ] Preserve Pi-native rendering parity for local and foreign turns
- [ ] Keep runtime/cwd/model observability clear in footer/debug surfaces
- [ ] Add launcher/node integration tests
- [ ] Add multi-machine manual bootstrap docs for the product install path
- [ ] Add failover/reconnect tests once replicated authority exists
- [ ] Reach parity on the product path for:
  - [ ] shared submit
  - [ ] runtime routing
  - [ ] runtime-local model routing
  - [ ] reconnect
  - [ ] presence
  - [ ] debug trace
  - [ ] local `/login`
- [ ] Make the product launcher path the default and retire the manual dev-only path deliberately

---

## Acceptance criteria for Advaita as a product

Advaita is ready as a real product when all of the following are true:

- [ ] A user can run `npm install -g @nkarpov/advaita` and then `advaita`
- [ ] Users do not manually manage a broker process
- [ ] Users do not manually invoke `pi -e ...`
- [ ] Advaita always uses the correct forked Pi runtime it was built against
- [ ] Each machine still feels like a **real Pi** first
- [ ] `/login` and local auth work naturally on each runtime
- [ ] Shared submit is intercepted and routed cleanly
- [ ] Runtime + model can be targeted in one request
- [ ] Remote model switches persist only on the targeted runtime
- [ ] Passive clients render live remote execution through Pi-native UI
- [ ] Reconnect/new join session hydration works without hacks
- [ ] After replicated authority lands, shutting down any single machine does not kill the session
- [ ] The fork surface remains small, generic, and isolated

---

## No-upstream-PR rule for this workstream

- [ ] Keep fork changes reviewable and isolated inside our own Pi fork
- [ ] Maintain clean internal branches/PRs only against our fork (`origin`)
- [ ] Use `upstream` only for reading/rebasing when needed
- [ ] Do **not** open PRs to the real Pi repo from this workstream under any circumstances
