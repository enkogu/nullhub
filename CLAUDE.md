# Documentation

Project documentation lives in [README.md](README.md) and `docs/`.

- Read first: `README.md`, then `AGENTS.md` (monorepo context, build/test
  commands, UI rules).

# Monorepo Context

Inside `nullclaw-multitenant` the canonical specs live in the parent:
`../../../docs/specs/` (start at `README.md`; `frontend.md` and `testing.md`
govern UI and test work here). The parent `../../../AGENTS.md` is the
engineering protocol.

# Product Terminology

- User-facing agent work cycles are called `Loops`, not `Processes`.
- Under the hood, a `Loop` is a ticket-backed NullTickets work cycle (the code-level entity is still named `pipeline` internally — never surface that word in UI); do not add a separate runtime/entity for `Loop` unless explicitly requested.
- Keep `Workflow` reserved for NullBoiler graph/orchestration concepts.
- See `../../../docs/specs/product.md` for the product boundary.
