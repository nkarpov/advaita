# Pi Fork API Gap

This note captures the generic APIs Advaita needs from the Pi fork at `/Users/nickkarpov/pi-mono`.

This file is intentionally created in Phase 0 so Phase 1 can refine it into the concrete implementation checklist.

## Working thesis

Advaita should use real Pi everywhere possible and add only a small number of generic forked APIs.

## Known required seams

### 1. Session hydration / import API
Need to:

- hydrate a local session replica from canonical broker state during reconnect/bootstrap
- append committed imported entries without replaying them as local user input
- rebuild session indexes/context safely

### 2. External live event rendering API
Need to:

- stream remote in-flight assistant/tool events into a passive mirror
- render them through stock Pi transcript/tool UI
- make foreign turns feel local while they are happening

### 3. Possibly a shared-turn execution helper
Need to validate whether extensions can cleanly:

- accept an assignment
- set the local model
- execute the turn locally
- diff committed entries afterward

If not, add a small generic helper in the fork.

## Non-goals for the fork

Do not put Advaita-specific logic in the fork:

- no routing policy
- no presence protocol
- no broker semantics
- no Advaita-specific commands

## Policy

- `origin` is our fork and the only push target for this workstream
- `upstream` is read-only reference/rebase material
- do not open PRs to upstream from this workstream
