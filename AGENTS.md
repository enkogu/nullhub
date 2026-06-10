# Documentation

Project documentation lives in [README.md](README.md) and `docs/`.

- Read first: `README.md`

# UI Implementation

- Use shadcn/shadcn-svelte components and patterns for UI by default across React, Svelte, and other frontend surfaces unless the user explicitly asks for another design system.
- Prefer existing shadcn primitives from `ui/src/lib/components/ui` before adding custom controls; keep controls compact and consistent with the local shadcn theme.

# Product Terminology

- User-facing agent work cycles are called `Loops`, not `Processes`.
- Under the hood, a `Loop` is a plain NullTickets `pipeline`; do not add a separate runtime/entity for `Loop` unless explicitly requested.
- Keep `Workflow` reserved for NullBoiler graph/orchestration concepts.
- See `../../../docs/specs/nullhub-loop-terminology.md` for the product boundary.
