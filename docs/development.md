# Development Setup

This repository is developed alongside a maintained fork of Pi.

## Repositories

Clone these two repositories as **siblings** in the same parent directory:

```bash
git clone https://github.com/nkarpov/advaita.git
git clone https://github.com/nkarpov/pi-mono.git
```

Example layout:

```text
workspace/
├─ advaita/
└─ pi-mono/
```

The sibling layout matters because several local development dependencies currently resolve through `../pi-mono/...` paths.

## Fork workflow

Advaita development uses the forked Pi repo, not upstream Pi directly.

Recommended remotes in `pi-mono`:

- `origin`: `https://github.com/nkarpov/pi-mono.git`
- `upstream`: `https://github.com/badlogic/pi-mono.git`

Recommended working branch for Pi-side Advaita work:

- `advaita/main`

## Install dependencies

In both repositories:

```bash
cd pi-mono
npm install

cd ../advaita
npm install
```

## Build the forked runtime

Build the Pi pieces Advaita depends on:

```bash
cd ../pi-mono
npm --prefix packages/ai run build
npm --prefix packages/agent run build
npm --prefix packages/tui run build
npm --prefix packages/coding-agent run build
```

Quick sanity check:

```bash
node packages/coding-agent/dist/cli.js --help
```

## Build and test Advaita

```bash
cd ../advaita
npm test
npm run build
```

## Product-path validation

Validate the launcher/product flow directly from the repo:

```bash
cd ../advaita
node packages/launcher/dist/cli.js doctor
node packages/launcher/dist/cli.js version --json
```

To validate the packed install path locally:

```bash
cd ../advaita
npm pack --workspace @nickkarpov/advaita
```

Then install that tarball into a temporary prefix or globally for testing.

## Low-level runtime integration testing

If you are working directly on the runtime integration layer, launch the forked runtime manually against the Advaita package:

```bash
cd ../pi-mono
node packages/coding-agent/dist/cli.js \
  -e ../advaita/packages/pi-package \
  --advaita-url ws://127.0.0.1:7171 \
  --advaita-session demo \
  --advaita-runtime <runtime-id>
```

Use the forked runtime here, not an unrelated global `pi` binary.

## Why the published package still works without a global Pi install

The published `@nickkarpov/advaita` package vendors the internal runtime assets it needs, including the forked `@mariozechner/pi-coding-agent` build.

That means:

- development uses sibling checkouts
- published installs use vendored runtime assets
- normal `advaita` usage does **not** depend on a global `pi` in `PATH`

## Current development model

Today the common workflow is:

1. make generic runtime changes in `pi-mono` when Advaita needs new reusable seams
2. build the relevant Pi packages
3. implement Advaita behavior in `advaita`
4. validate with `npm test` / `npm run build`
5. validate the product path with `advaita doctor` or a packed install

## Public vs private notes

The `notes/` directory is intentionally treated as local/private working scratch space and is not part of the public development contract.

Public bootstrap guidance should live in this document instead.
