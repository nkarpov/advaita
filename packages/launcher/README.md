# @nickkarpov/advaita

The published Advaita product package.

## Role

This package owns the real user-facing install and launch surface:

```bash
npm install -g @nickkarpov/advaita
advaita
```

It is responsible for:

- shipping the `advaita` CLI
- resolving and launching the controlled Advaita runtime
- auto-loading the Advaita runtime integration package
- auto-starting or auto-attaching the local broker for the current single-host architecture
- exposing user-facing commands like `advaita`, `advaita join`, `advaita host`, `advaita doctor`, and `advaita version`

## Runtime ownership

Advaita does **not** trust a global `pi` binary in `PATH`.

Instead, the published package vendors the internal runtime assets it must control:

- forked `@mariozechner/pi-coding-agent`
- `@advaita/broker`
- `@advaita/pi-package`
- `@advaita/shared`

Public npm dependencies are still installed normally from npm, but the launcher resolves its **own vendored runtime copy** first and executes that directly.

So:

- a globally installed `pi` does not control what `advaita` launches
- Advaita can require fork-only APIs safely
- local Pi auth/config state is still reused on each machine

## Current product behavior

Today this package supports:

- local session start via `advaita`
- local attach / Tailscale discovery / prompt-to-host via `advaita <session>`
- explicit hosting via `advaita host`
- explicit joins via `advaita join`
- local preflight diagnostics via `advaita doctor`
- version/install diagnostics via `advaita version`

## Router model/auth behavior

The router reuses the broker host’s local Pi auth/model environment.

That means:

- no separate Advaita router API key setup
- if the host machine is already logged in locally, the router can use that model context
- if router model resolution is unavailable, Advaita falls back to heuristic routing

Typical setup:

```bash
export ADVAITA_ROUTER_MODE=auto
export ADVAITA_ROUTER_MODEL=gpt-5.1-codex-mini
advaita doctor
advaita
```

## Next major phase

The next big step after the current product-polish slice is **Phase 7: managed local Advaita node lifecycle**.
