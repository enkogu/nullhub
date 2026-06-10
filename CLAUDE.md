# Documentation

Project documentation lives in [README.md](README.md) and `docs/`.

- Read first: `README.md`

# Product Terminology

- User-facing agent work cycles are called `Loops`, not `Processes`.
- Under the hood, a `Loop` is a plain NullTickets `pipeline`; do not add a separate runtime/entity for `Loop` unless explicitly requested.
- Keep `Workflow` reserved for NullBoiler graph/orchestration concepts.
- See `../../../docs/specs/nullhub-loop-terminology.md` for the product boundary.
