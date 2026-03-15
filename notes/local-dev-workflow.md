# Local Dev Workflow

## Core rule

Any Pi dependency used by Advaita comes from **our fork** at:

- `/Users/nickkarpov/pi-mono`

Advaita does **not** treat upstream Pi as its active dependency source.

## Current state vs product state

### Product state reached in Phase 6

Advaita now has a real launcher/install surface:

```bash
npm install -g @nickkarpov/advaita
advaita
```

Phase 6 implemented that product surface in `packages/launcher` and chose the **bundle a controlled runtime dependency into Advaita** strategy.

That means the launcher package owns:

- the `advaita` CLI
- the forked Pi runtime it launches
- the Advaita Pi package wiring
- local broker auto-start/auto-attach for current single-node use

### Ongoing development state

Even though the product launcher now exists, day-to-day development still uses sibling local checkouts:

- `/Users/nickkarpov/pi-mono`
- `/Users/nickkarpov/advaita`

That remains the right workflow while we continue evolving Phases 7+.

## Remotes policy

In `/Users/nickkarpov/pi-mono`:

- `origin` = `https://github.com/nkarpov/pi-mono.git`
- `upstream` = `https://github.com/badlogic/pi-mono.git`

Rules:

- push Pi work only to `origin`
- use `upstream` only for reading/rebasing when needed
- do **not** open PRs to upstream from this workstream

## Verified Phase 1 baseline

The following was verified during Phase 1:

- the fork checkout exists and is healthy at `/Users/nickkarpov/pi-mono`
- remotes are configured correctly (`origin` = our fork, `upstream` = real Pi repo)
- stock Pi builds successfully from the fork
- stock Pi CLI help runs successfully from the forked build
- branch `advaita/main` exists in the fork and tracks `origin/advaita/main`

Validation commands already exercised:

```bash
cd /Users/nickkarpov/pi-mono
npm ci
npm --prefix packages/ai run build
npm --prefix packages/agent run build
npm --prefix packages/tui run build
npm --prefix packages/coding-agent run build
node packages/coding-agent/dist/cli.js --help
```

## Workspace layout

```text
/Users/nickkarpov/pi-mono   # our Pi fork
/Users/nickkarpov/advaita   # Advaita V2
```

## Dependency policy for Advaita packages

When Advaita code needs Pi packages, it should consume the forked `@mariozechner/pi-*` packages from `/Users/nickkarpov/pi-mono`.

Typical examples:

- `@advaita/pi-package` depends on forked `@mariozechner/pi-coding-agent`
- the launcher bundles the forked `@mariozechner/pi-coding-agent` into the product tarball during pack/publish preparation
- packages using lower-level APIs may also depend on forked `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, or `@mariozechner/pi-tui`

## Local install workflow for development

When a package in `/Users/nickkarpov/advaita` is ready to import Pi code directly, install the forked packages from the sibling checkout.

Example:

```bash
cd /Users/nickkarpov/advaita
npm install --workspace @advaita/pi-package \
  ../pi-mono/packages/coding-agent \
  ../pi-mono/packages/agent \
  ../pi-mono/packages/ai \
  ../pi-mono/packages/tui
```

That makes the dependency source explicit: Advaita is using our fork, not the public upstream release line.

## Useful developer run paths

### Product-path launcher validation

```bash
cd /Users/nickkarpov/advaita
npm run build
node packages/launcher/dist/cli.js doctor
node packages/launcher/dist/cli.js demo -- --help
```

### Low-level Pi-package validation

For lower-level client/extension work, you can still use the forked runtime directly:

```bash
cd /Users/nickkarpov/pi-mono
node packages/coding-agent/dist/cli.js \
  -e /Users/nickkarpov/advaita/packages/pi-package \
  --advaita-url ws://127.0.0.1:7171 \
  --advaita-session demo
```

## Working loop

1. make generic Pi changes in `/Users/nickkarpov/pi-mono`
2. build the needed Pi packages in the fork
3. consume those forked packages from `/Users/nickkarpov/advaita`
4. implement Advaita behavior against the forked APIs
5. validate the product path through `packages/launcher`
6. push Pi work to `origin` in `pi-mono`
7. push Advaita work to `origin` in `advaita`

## Important note

The fork is the source of truth for Pi-side Advaita work.

That means:

- Advaita's Pi dependency is **our fork**
- not upstream
- not a hypothetical future upstream merge
- not a separate private patch layer hidden outside version control
