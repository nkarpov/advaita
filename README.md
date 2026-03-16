# Advaita

Advaita is a collaborative coding agent CLI for working in **one shared coding session across multiple machines**.

You can start a session on one machine, join it from another, route turns to the right runtime, switch runtimes on the fly, and watch remote execution stream live back into every connected terminal.

## Why Advaita

Advaita is built for workflows like:

- coding from a laptop while also using a Linux box for local tools or GPU access
- keeping one shared transcript across multiple developer machines
- sending a turn to a different runtime without leaving your current terminal
- making remote execution feel immediate instead of copy-pasted or delayed

## Experimental status

Advaita is **experimental**.

It is already usable for real multi-machine work, but if `tmux` + SSH feels simpler and better for your workflow, that is a completely reasonable conclusion.

## Why not just tmux + SSH?

### Is this just tmux + SSH with extra steps?
Sometimes, yes — and for many workflows, **tmux + SSH is simpler and probably better**.

Advaita is different only if you want to share an **agent session**, not just a terminal:

- one shared transcript
- visible runtime state
- routed turns
- live streamed remote execution
- reconnectable shared session state

If you just want one shell visible on multiple machines, use tmux.

### Why not just use one agent with SSH/bash tools?
That is the strongest alternative, and it covers a lot of the same ground.

Advaita only becomes meaningfully different when other machines need to be **first-class runtimes**, not just remote tools:

- each machine keeps its own auth
- its own model availability
- its own cwd/environment
- its own local runtime state

### So what is the real thing Advaita adds?

The shortest answer is:

> Advaita treats multiple machines as one shared coding-agent session.

## Install

```bash
npm install -g @nickkarpov/advaita
```

Then run:

```bash
advaita
```

## Core features

- **Shared sessions across machines**
  - one transcript, multiple connected runtimes
- **Runtime-aware turn routing**
  - sticky runtime switches like `switch to linux`
  - one-turn overrides like `run this on mac`
  - origin-relative aliases like `local`, `here`, and `my machine`
- **Live remote execution streaming**
  - remote tool/model activity streams into every connected terminal as it happens
- **Runtime-local model state**
  - each runtime keeps its own current model
  - turns can request model changes on the selected runtime
- **Presence and session visibility**
  - connected runtimes, join notices, queue state, and current/local runtime are visible in the UI
- **Runtime picker**
  - `Ctrl+R` opens a runtime selector in the TUI
- **Session discovery and invites**
  - `advaita <session>` tries local attach first, then Tailscale discovery
  - `/advaita-invite` prints shareable join commands
- **Local auth stays local**
  - each machine keeps its own login, model availability, and settings

## Quick start

### Start or join a session

On one machine:

```bash
advaita harbor
```

On another machine on the same Tailscale tailnet:

```bash
advaita harbor
```

If discovery cannot find the session automatically, use the explicit form:

```bash
advaita join ws://<host>:7171 harbor
```

### Useful commands inside the TUI

- `/advaita-invite` — show explicit join commands for the current session
- `/runtime <runtime-id>` — switch the shared default runtime
- `/advaita-debug` — inspect current Advaita connection/session state
- `Ctrl+R` — open the runtime picker

## What the current product does

Today’s build includes:

- installable `advaita` CLI
- automatic local broker startup/attach
- shared-session routing across multiple runtimes
- live streamed remote execution
- runtime-local sticky model state
- Tailscale-backed session discovery
- durable route/runtime/model notices in the chat transcript
- a visible current/local runtime header above the input

## Current limitations

Advaita is already usable, but it is still early:

- session authority is still centralized per session host
- each machine still needs its own local model auth/login
- queued-turn transcript edge cases still need more polish
- pure remote model-switch-only control turns are not finished yet
- shared image turns are not supported yet
- some local Pi session commands are intentionally blocked while connected to a shared session

## Runtime ownership and packaging

Advaita does **not** depend on whatever global `pi` binary happens to be installed on a machine.

Instead, the published `@nickkarpov/advaita` package launches a **controlled vendored runtime**:

- Advaita ships its own forked `@mariozechner/pi-coding-agent` build inside the package
- it also vendors its internal broker / shared / Pi-package pieces
- public npm dependencies are installed normally from npm
- the launcher resolves and starts its own vendored runtime directly

That means:

- a stale or unrelated global `pi` install does **not** affect normal `advaita` usage
- Advaita still reuses the machine’s local Pi auth/config state where that is helpful
- local `/login`, model availability, and settings remain machine-local by design

## Relationship to Pi

Advaita reuses Pi where it is strong:

- the local coding-agent UI
- local tool execution
- local auth/model configuration
- session mechanics and extension infrastructure

But the multiplayer session model, routing, discovery, transcript replication, and shared execution experience are Advaita’s domain.

## Status

- **Phases 0–6:** complete
- **Current status:** product-polish pass complete enough for real multi-machine use
- **Next major phase:** managed local Advaita node lifecycle
- **Later phase:** replicated session authority and failover

See [`TODO.md`](./TODO.md) for the current roadmap.

## Repository layout

```text
docs/development.md      local bootstrap and contributor setup
packages/shared          protocol, routing helpers, shared types
packages/broker          broker/router/session authority
packages/pi-package      Advaita TUI/runtime integration layer
packages/launcher        published @nickkarpov/advaita CLI package
packages/integration-tests multi-runtime validation scaffolding
```

## Development

Active repositories:

- Advaita: `https://github.com/nkarpov/advaita`
- Pi fork: `https://github.com/nkarpov/pi-mono`

For local bootstrap, sibling-clone layout, fork workflow, and development commands, see [`docs/development.md`](./docs/development.md).
