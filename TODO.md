# Advaita Roadmap

## Current status

Advaita has shipped its first real product surface:

- `npm install -g @nickkarpov/advaita`
- `advaita`

What is already working in the current build:

- installable launcher-owned runtime
- automatic local broker startup/attach
- shared sessions across multiple machines
- sticky runtime routing plus one-turn runtime overrides
- origin-relative runtime aliases like `local` / `here`
- live remote Pi event streaming into every connected client
- runtime-local model state and model notices
- Tailscale session discovery
- `/advaita-invite`
- runtime picker on `Ctrl+R`
- durable join / route / runtime / model notices in the transcript
- current/local runtime header above the input

## What remains before the next major architecture phase

These are the main remaining product-polish items:

- [ ] finish queued-turn transcript/immediacy edge cases
- [ ] support pure remote model-switch-only control turns
- [ ] expand real cross-machine smoke coverage on the npm-installed build
- [ ] continue UI hardening based on real-world use

The current product is usable now. The next big step is no longer basic launcher/install work — it is lifecycle and resilience.

---

## Phase summary

### Phase 0 — Clean V2 workspace
- [x] Freeze the legacy prototype and move V2 work into a clean repo

### Phase 1 — Fork-based local development setup
- [x] Wire Advaita against the maintained Pi fork

### Phase 2 — Generic Pi fork seams
- [x] Add session sync / import / external-render / continuation APIs to the fork

### Phase 3 — Shared protocol and routing layer
- [x] Build `@advaita/shared`

### Phase 4 — Thin canonical broker
- [x] Build `@advaita/broker`

### Phase 5 — Real client/runtime integration
- [x] Build `@advaita/pi-package`
- [x] Execute assigned turns through a real synchronized local runtime
- [x] stream remote execution incrementally into connected clients

### Phase 6 — Product launcher and install surface
- [x] Ship `@nickkarpov/advaita` as the real user-facing package
- [x] own the runtime that Advaita launches
- [x] stop relying on global `pi` in `PATH`
- [x] auto-load the Advaita runtime package
- [x] auto-start or auto-attach the local broker
- [x] publish a working npm install path

### Phase 6 polish — UX coherence and multi-machine usability

#### Transcript and execution UX
- [x] stop broker-side raw transcript rewriting on the normal path
- [x] preserve raw submitted user text in the shared transcript
- [x] show a distinct pre-execution **Attuning...** state before execution starts
- [ ] finish queued-turn transcript edge cases
- [x] clear stale passive remote working state after mirrored turns complete

#### Runtime visibility and controls
- [x] move the primary runtime indicator to the header above the input
- [x] simplify/remove footer session status below the input
- [x] show durable route/runtime/model notices in the transcript
- [x] add a keyboard runtime picker on `Ctrl+R`
- [x] improve runtime-picker visibility with a boxed overlay

#### Session flow and discovery
- [x] make `advaita` create a friendly random session by default
- [x] make `advaita <session>` try local attach first, then Tailscale discovery
- [x] add Tailscale discovery fallback for WSL via Windows Tailscale binaries
- [x] improve missing-session messaging when discovery is unavailable or finds nothing
- [x] make implicit local hosting discoverable when it becomes the host
- [x] add `/advaita-invite`
- [x] broadcast session join notices into the transcript

#### Routing behavior
- [x] support sticky runtime switches vs one-turn overrides
- [x] support origin-relative runtime aliases (`local`, `here`, `this machine`, `my machine`)
- [x] reuse local Pi auth/model config for the router on the broker host
- [ ] support pure model-switch-only remote control turns

### Acceptance snapshot

Advaita now supports the intended common loop:

- install with npm
- run `advaita <session>` on one machine
- join the same session from another machine
- route turns between machines
- see remote execution stream live
- keep local machine auth/model state local

---

## Next phases

### Phase 7 — Managed local Advaita node

Move from “launcher starts a local broker process” to a more durable local node model.

- [ ] introduce a longer-lived local Advaita node/service per machine
- [ ] let the TUI attach to that node instead of owning the full lifecycle
- [ ] allow the local node to outlive TUI restarts where appropriate
- [ ] add node diagnostics / management surfaces

### Phase 8 — Replicated session authority and failover

Move beyond a single canonical session host.

- [ ] replicate canonical session state across nodes
- [ ] support authority handoff / failover
- [ ] recover or requeue active turns after authority loss
- [ ] keep the session alive when one machine disappears

### Phase 9 — Broader shared command semantics

- [ ] finalize richer shared vs local command handling
- [ ] extend shared-session controls where they make sense
- [ ] keep deterministic/local commands deterministic and local-first

---

## Architectural invariants

These remain intentional:

- Advaita is its own CLI product surface
- the local runtime still reuses Pi’s auth/config/model architecture
- global `pi` in `PATH` is not a product dependency
- remote execution should stream live, not appear as chunky snapshots
- the router is a structured current-turn classifier, not a whole-transcript planner
- local commands like `/login` remain local to each machine

---

## Repositories

Active work:

- Advaita: `https://github.com/nkarpov/advaita`
- Pi fork: `https://github.com/nkarpov/pi-mono`

Local roots:

- `/Users/nickkarpov/advaita`
- `/Users/nickkarpov/pi-mono`

Legacy reference only:

- `/Users/nickkarpov/ws/advaita`
