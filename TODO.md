# Advaita V2 TODO

## Thesis

Advaita V2 should be a **fresh implementation** built around:

- a **thin canonical broker/router**
- a **real long-lived Pi runtime on each machine**
- an **Advaita Pi package/extension** that owns most multiplayer behavior
- a **small Advaita-maintained Pi fork** for the generic abstractions Pi does not yet expose publicly

The point is to stop treating Pi as a low-level engine and instead treat it as the real local runtime/UI/session system.

Advaita-specific logic should live mostly in:

- broker/session transport
- routing policy
- presence/protocol
- Advaita Pi package

Only the following should live in the Pi fork:

- **generic session sync/hydration APIs**
- **generic external event rendering APIs**
- other small generic seams required for multiplayer/session replication

Live remote execution must stream incrementally and feel local. During a normal shared turn, the executing runtime streams its in-flight Pi events to the broker, and the broker immediately fans those events out to every other connected mirror so the turn appears to be happening locally in real time. Snapshot/session hydration is for reconnect/bootstrap only, not the normal steady-state propagation path.

We will use **our own Pi fork as a dependency immediately**. The fork already lives at `/Users/nickkarpov/pi-mono`, with `origin` pointing at our fork and `upstream` pointing at the real Pi repo. Advaita proceeds against our fork only. Do not open PRs to upstream as part of this plan.

---

## Core product model

### Local Pi owns

- `/login`
- `/logout`
- local auth credentials
- local model availability
- local sticky model state
- local settings/themes/extensions
- local cwd/environment
- local session runtime state

### Advaita broker owns

- canonical shared transcript ordering
- who executes the next shared turn
- runtime routing
- optional runtime-local model routing
- presence/typing
- reconnect/bootstrap sync via snapshot when needed
- live streaming fanout of in-flight Pi events during active turns
- queueing/reassignment

### Advaita Pi package owns

- intercepting shared submit before local prompt execution
- deciding which commands stay local vs become shared Advaita commands
- broker connection on each machine
- presence reporting
- local runtime model updates in response to broker assignments
- import of committed shared transcript entries into local Pi sessions
- rendering remote/shared live execution into the local Pi session as ordinary in-flight assistant/tool activity

---

## What we keep from the current prototype

- canonical broker idea
- runtime routing rules
- model-query parsing learnings
- Pi-shaped durable session/log design
- turn trace / observability ideas
- smoke/integration test learnings
- reconnect/requeue/presence learnings

## What we stop carrying forward as architecture

- patched `AdvaitaInteractiveMode` as the main foundation
- synthetic local mirror as the center of the client architecture
- treating Pi auth/model/session semantics as if they belong to the broker
- global session-wide sticky model state
- heavy command blocking just because the system is shared

---

## Fresh implementation layout

Create a **new clean implementation** at `/Users/nickkarpov/advaita` instead of continuing to mutate the old prototype tree.

Planned layout:

```text
/Users/nickkarpov/advaita/
├─ TODO.md                      # this file
├─ README.md                    # architecture summary once implementation starts
├─ packages/
│  ├─ broker/                   # thin Advaita broker/router
│  ├─ shared/                   # protocol, routing parsers, shared types
│  ├─ pi-package/               # Advaita Pi extension/package
│  ├─ launcher/                 # tiny advaita launcher/installer/bootstrapper
│  └─ integration-tests/        # multi-runtime tests and fixtures
└─ notes/
   ├─ pi-fork-api-gap.md        # precise forked Pi abstraction list
   ├─ command-classification.md # local vs shared command rules
   └─ migration-plan.md         # cutover from legacy prototype
```

The existing prototype at `/Users/nickkarpov/ws/advaita` is now **reference-only** until V2 reaches parity.

---

## Extension feasibility matrix

This is the key decision table for V2.

| Capability | Can Pi extension do it today? | Verdict |
|---|---:|---|
| Intercept Enter / user input before local agent prompt | Yes (`input` event) | **Use extension** |
| Leave `/login` and `/logout` local | Yes (do not intercept them) | **Use extension** |
| Register Advaita commands like `/runtime`, `/advaita-debug` | Yes (`registerCommand`) | **Use extension** |
| Maintain broker websocket connection | Yes | **Use extension** |
| Set local sticky model for this runtime | Yes (`setModel`, `model_select`) | **Use extension** |
| Render presence/footer/widgets/status | Yes (`setStatus`, `setFooter`, `setWidget`) | **Use extension** |
| Append Advaita custom metadata entries | Yes (`appendEntry`) | **Use extension** |
| Import broker-committed assistant/tool/user entries into local Pi transcript | No clean public API | **Needs Pi fork** |
| Replace/hydrate a local Pi session from broker snapshot on connect/reconnect | No clean public API | **Needs Pi fork** |
| Render externally-produced live turn events through stock Pi transcript/tool UI | No clean public API | **Needs Pi fork** |
| Keep external imported entries from re-triggering local input semantics | Not cleanly exposed | **Needs Pi fork** |
| Local execution of assigned turn against already-synced Pi session | Mostly yes | **Extension + maybe tiny fork helper** |

Conclusion:

- **Most multiplayer behavior can and should live in an Advaita Pi package/extension.**
- The missing pieces are exactly the generic APIs for **session replication** and **external event rendering**.
- Normal steady-state shared turns should propagate as **live streamed events**, not periodic full-session snapshots.
- Therefore the right move is **extension-first + small Pi fork**, not a fully custom shell.

---

## Required Pi fork abstractions

These are the generic APIs we need in our Pi fork.

### A. Public session import / hydration API

Need a public way to make a local Pi session become a replica of external canonical state for reconnect/bootstrap and for post-commit transcript import.

Target capabilities:

- replace local session contents from a broker snapshot during reconnect/bootstrap
- append imported committed entries incrementally after canonical commit
- rebuild `SessionManager` indexes safely
- rebuild agent context safely
- avoid treating imported entries as locally typed user input
- keep this separate from the live in-flight streaming path

Possible API shapes:

```ts
session.replaceSessionContents(header, entries, options?)
session.importEntries(entries, options?)
session.rebuildFromSessionManager()
```

or

```ts
sessionManager.replaceContents(header, entries)
sessionManager.importEntries(entries)
```

Plus an extension-facing wrapper like:

```ts
pi.syncSession(snapshot)
pi.importEntries(entries)
```

### B. Public external-event rendering API for InteractiveMode

Need a way to render broker-fed live events through stock Pi assistant/tool UI as if the turn were happening locally.

Target capabilities:

- feed externally-produced `AgentSessionEvent`-like events into transcript rendering incrementally
- render remote assistant streaming token-by-token / chunk-by-chunk in place
- render remote tool execution rows/results while they happen
- make foreign execution feel like an ordinary live Pi turn, not a later snapshot paste
- distinguish local vs imported/external turns for debug/metadata

Possible API shapes:

```ts
interactiveMode.renderExternalSessionEvent(event, meta?)
interactiveMode.attachExternalEventSource(source)
```

and/or extension-facing wrapper:

```ts
pi.renderExternalEvent(event, meta?)
pi.beginExternalTurn(meta?)
pi.endExternalTurn(meta?)
```

This is the primary live propagation path: executor runtime emits the same stream to its own UI and to the broker, and the broker redistributes that event stream to all other mirrors in real time.

### C. Optional helper for shared turn execution from current synced state

We may be able to use existing local prompt APIs for assigned turns once the local session is kept in sync.

Need to verify whether the following is enough:

- extension receives assignment
- extension sets local model if required
- extension locally sends the assigned user turn into Pi
- extension diffs appended entries after completion
- extension sends those committed entries to broker

If current APIs are awkward, add a small helper such as:

```ts
pi.executeSharedTurn(text, options?)
```

This should still remain generic and not Advaita-specific in naming/behavior if possible.

### D. Footer/status composition

Pi already has enough primitives here. No fork work unless we discover a hard limitation.

### E. Keep changes generic

Every fork change should satisfy this rule:

> if a cloud session service, collaborative client, remote executor, or replay tool would also need this, it belongs in the fork.

If it is only about Advaita routing/presence/protocol, it belongs in Advaita, not Pi.

---

## Package/repo strategy for the Pi fork

### Phase 0 choice

Use our own fork of Pi immediately.

### Dev strategy

- use the existing fork checkout at `/Users/nickkarpov/pi-mono`
- keep upstream package names initially to minimize migration friction
- consume the fork locally in development via sibling checkout + file/workspace dependency
- treat `origin` as the only push/PR target for this work
- treat `upstream` as read-only reference/rebase material only

Suggested local checkouts:

```text
/Users/nickkarpov/advaita
/Users/nickkarpov/pi-mono
```

### CI / reproducible installs strategy

After the fork API stabilizes, choose one:

- publish forked packages to our own registry/scope, or
- use pinned git/tarball builds from our fork, or
- vendor built tarballs in CI

Do **not** block V2 on public package publishing.

### Upstream safety rule

- `origin` is our fork and is the only remote we target for Advaita-related Pi changes
- `upstream` exists only so we can inspect/rebase from the real Pi repo when needed
- **Do not open PRs to upstream under any circumstances as part of this plan**
- any future contribution discussion happens later and separately from V2 delivery

---

## End-to-end TODO plan

## Phase 0 — Freeze the current prototype and create the clean workspace

- [x] Tag the current implementation as `legacy-prototype` (or equivalent checkpoint)
- [x] Treat `/Users/nickkarpov/ws/advaita` as reference only, not the foundation for V2
- [x] Create the clean V2 package roots under `/Users/nickkarpov/advaita/packages/`
- [x] Create a concise architecture README for V2 once package layout exists
- [x] Preserve current docs/tests as historical reference while building V2 separately

## Phase 1 — Wire local development against the existing Pi fork

- [x] Verify the local fork checkout at `/Users/nickkarpov/pi-mono` is healthy
- [x] Verify `origin` points at our fork and `upstream` points at the real Pi repo
- [x] Add a documented local-dev workflow for building Advaita against the forked Pi packages from `/Users/nickkarpov/pi-mono`
- [x] Verify we can run stock Pi from our fork before any Advaita changes
- [x] Create an `advaita/main` branch in the fork for our generic API work
- [x] Create `/Users/nickkarpov/advaita/notes/pi-fork-api-gap.md` with the exact abstraction list before coding the fork
- [x] Add an explicit note in local docs: never open upstream PRs from this workstream

## Phase 2 — Implement the minimal generic APIs in the Pi fork

- [x] Add public session replacement/hydration API
- [x] Add public imported-entry append API
- [x] Ensure imported entries rebuild `SessionManager` + agent context correctly
- [x] Ensure imported entries do **not** re-trigger local user input semantics
- [x] Add public external-event rendering API for InteractiveMode
- [x] Add extension-facing wrappers for the above APIs if needed
- [x] Add fork tests covering hydration/import/external-rendering behavior
- [x] Keep all fork changes generic and independently reviewable

## Phase 3 — Build the new shared package layer in Advaita V2

- [ ] Implement `packages/shared` for protocol/types/routing helpers
- [ ] Move runtime routing parser into V2 shared package
- [ ] Move model-query parsing into V2 shared package
- [ ] Define the smallest possible broker protocol for:
  - hello/runtime presence
  - submit raw shared turn
  - assignment
  - streamed external events as the primary live propagation path
  - committed entry append after canonical turn commit
  - reconnect/bootstrap snapshot only for late join/recovery
- [ ] Explicitly model runtime-local sticky model state in shared types

## Phase 4 — Rebuild the broker as a thin canonical authority

- [ ] Implement a new thin broker package instead of piling more onto the legacy broker
- [ ] Keep the broker authoritative for ordering, queueing, routing, and fanout only
- [ ] Make live turn fanout incremental/event-stream-based, not snapshot-based
- [ ] Remove any broker ownership of local auth semantics
- [ ] Remove any broker assumption of one global sticky model for the whole session
- [ ] Track per-runtime connected state:
  - runtime id
  - client id
  - cwd
  - local current model
  - available models
  - presence/typing/executing
- [ ] Route runtime + optional requested model in the same decision pass
- [ ] Requeue if assigned runtime disconnects mid-turn
- [ ] Support reconnect snapshot sync for late joiners/new replicas

## Phase 5 — Build the Advaita Pi package/extension as the main client layer

- [ ] Create `packages/pi-package` as the real local client behavior package
- [ ] Open broker connection on `session_start`
- [ ] Use Pi `input` hook to intercept shared-turn submission
- [ ] Leave local Pi commands alone unless explicitly classified as shared
- [ ] Register Advaita commands such as:
  - `/runtime`
  - `/advaita-debug`
  - `/route-debug`
  - maybe `/advaita-status`
- [ ] Use footer/widget APIs for presence/routing/debug info
- [ ] Send typing/presence state to the broker
- [ ] Send local model state changes to broker via `model_select`
- [ ] On assigned turn:
  - ensure local session is synced
  - switch local model if requested
  - execute the turn locally with real Pi
  - stream in-flight Pi events to the broker as they occur
  - diff appended committed entries after completion
  - send committed entries back to broker for canonical append
- [ ] On broker commit for foreign turns:
  - import committed entries into the local Pi session replica
- [ ] On broker live stream for foreign turns:
  - render external events progressively through stock Pi UI using fork APIs
  - make the foreign turn appear as ordinary live local assistant/tool activity, not a post-hoc snapshot replacement

## Phase 6 — Command classification (critical)

- [ ] Write `notes/command-classification.md`
- [ ] Define **local-only** commands that should remain normal Pi behavior
- [ ] Define **shared/brokered** commands that Advaita intercepts
- [ ] Define **deferred** commands that need dedicated shared semantics before enabling

### Expected local-only commands in V2

- [ ] `/login`
- [ ] `/logout`
- [ ] local provider/model availability setup
- [ ] `/reload`
- [ ] `/hotkeys`
- [ ] `/changelog`
- [ ] `/debug`
- [ ] likely parts of `/settings`
- [ ] likely local `/model` until a better shared story exists

### Expected shared/brokered commands in V2

- [ ] normal free-text shared submit
- [ ] `/runtime`
- [ ] Advaita debug/status commands
- [ ] remote runtime model targeting via natural language and/or explicit Advaita command

### Deferred shared-session commands

- [ ] `/new`
- [ ] `/tree`
- [ ] `/fork`
- [ ] `/resume`

Do not enable these until their shared semantics are explicitly designed.

## Phase 7 — Runtime-local model semantics done correctly

- [ ] Keep sticky model state local to each runtime, not global to the session
- [ ] Use local Pi auth/model registry as the source of truth for what a runtime can run
- [ ] Let one runtime request another runtime switch models through the broker
- [ ] Ensure remote model switch occurs **before** assigned turn execution
- [ ] Ensure local `/login` on each machine updates only that machine's Pi auth state
- [ ] Ensure reconnect hello reports local current model + available models
- [ ] Decide whether `/model` remains purely local in V2 initially
- [ ] Add a future explicit remote-model command if natural-language-only routing feels too opaque

## Phase 8 — Session sync / replica semantics

- [ ] Decide the authoritative turn commit flow
- [ ] Prefer this model if feasible:
  - executor local Pi generates the turn's user/assistant/tool entries
  - executor simultaneously streams its live Pi events to the broker while the turn is running
  - broker immediately fans those live events out to all other connected mirrors
  - broker commits exactly the executor's resulting entries canonically at end-of-turn
  - passive clients import those committed entries after commit
- [ ] Treat live event streaming as the normal steady-state mirror mechanism
- [ ] Use full snapshot/session hydration only for reconnect/bootstrap/recovery, not for ordinary live turns
- [ ] Avoid duplicate-user-entry flows if possible
- [ ] Ensure reconnect/new joiners can hydrate from canonical snapshot cleanly
- [ ] Ensure executor runtime does not need awkward self-reimport for its own just-committed turn
- [ ] Add clear metadata for imported vs locally-authored-but-broker-committed entries if needed

## Phase 9 — Pi-native UI / rendering parity

- [ ] Keep footer status in the bottom/footer region, not a separate pseudo-TUI row
- [ ] Use stock Pi transcript/tool rendering for both local and remote turns where possible
- [ ] Preserve runtime/cwd/model badges for observability
- [ ] Keep `/advaita-debug` authoritative and broker-derived
- [ ] Make passive remote execution feel indistinguishable from local Pi execution except for runtime badges, including incremental streaming while the turn is in flight
- [ ] Keep theme/extension/widget behavior local per runtime

## Phase 10 — Observability and debugging

- [ ] Keep routed-turn trace store in V2
- [ ] Show:
  - origin runtime
  - requested runtime
  - requested model query
  - chosen runtime
  - chosen local model
  - executor client id
  - execution cwd
- [ ] Add structured broker debug logs for assignment/commit/requeue/reconnect
- [ ] Add a deterministic multi-runtime test fixture with distinct cwd fingerprints
- [ ] Add explicit model-routing tests alongside runtime-routing tests

## Phase 11 — Testing strategy

- [ ] Forked Pi unit tests for new generic APIs
- [ ] Broker unit tests for runtime/model routing and reconnect
- [ ] Extension integration tests for input interception and local command passthrough
- [ ] Replica sync tests for imported entries and reconnect hydration
- [ ] Live-stream mirror tests to verify passive clients see incremental assistant/tool events during foreign execution, not only final commit state
- [ ] Cross-runtime model persistence tests:
  - mac changes linux to gpt-5
  - linux stays on gpt-5 afterward
  - mac remains unchanged
- [ ] Real two-machine manual bootstrap docs using Tailscale/SSH
- [ ] Keep smoke tests for the broker thin path

## Phase 12 — Migration and cutover

- [ ] Introduce a new V2 entrypoint instead of swapping the legacy path immediately
- [ ] Keep legacy prototype runnable during V2 buildout
- [ ] Reach parity on:
  - shared submit
  - runtime routing
  - remote model routing
  - reconnect
  - presence
  - debug trace
  - local `/login`
- [ ] Only then make V2 the default path
- [ ] After cutover, archive/delete legacy client path deliberately instead of half-maintaining both forever

---

## Acceptance criteria for V2

V2 is ready when all of the following are true:

- [ ] Each machine feels like a **real Pi** first, not a fake wrapper around Pi
- [ ] `/login` and local auth work naturally on each runtime
- [ ] Shared submit is intercepted and broker-routed cleanly
- [ ] Runtime + model can be targeted in one request
- [ ] Remote model switches persist only on the targeted runtime
- [ ] Passive clients render live remote execution through Pi-native UI
- [ ] Normal live turns stream into every mirror as if they were local in-flight Pi turns, not chunky snapshot refreshes
- [ ] Reconnect/new join session hydration works without hacks
- [ ] Fork surface is small, generic, and isolated
- [ ] Advaita-specific logic lives outside the Pi fork whenever possible
- [ ] We can upgrade/rebase our Pi fork with manageable pain

---

## No-upstream-PR rule for this workstream

- [ ] Keep fork changes reviewable and isolated inside our own Pi fork
- [ ] Maintain clean internal branches/PRs only against our fork (`origin`)
- [ ] Use `upstream` only for reading/rebasing when needed
- [ ] Do **not** open PRs to the real Pi repo from this workstream under any circumstances

---

## Final rule of thumb

If a feature is about:

- local auth
- local model availability
- local Pi UI/theme/extensions
- local session/runtime behavior

then it should stay in **real Pi + extension land**.

If it is about:

- who runs the next shared turn
- which runtime's model should be changed
- shared transcript ordering
- presence/reconnect/fanout

then it belongs in **Advaita broker/package land**.

If we need a generic new seam to connect the two cleanly, it goes in **our Pi fork**.
