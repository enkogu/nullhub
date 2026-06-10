# NullHub UI PR Checklist

Use this checklist for changes under `apps/nullstack/nullhub/ui/`. Mark items
that do not apply as `N/A` with a short reason in the PR body.

## Scope

- [ ] The PR cites the owning bead and the relevant spec anchor.
- [ ] The change stays inside the bead scope and does not mix unrelated
  component refactors.
- [ ] Product terminology and navigation match
  [`docs/specs/product.md`](../../../../docs/specs/product.md).

## Components

- [ ] New or changed components are placed in the correct layer from
  [`CONTRIBUTING.md`](CONTRIBUTING.md): `ui/` primitive, app composite, or
  domain composite.
- [ ] Missing base controls were added through the shadcn-svelte CLI, not
  hand-authored or copied from another kit.
- [ ] Components use tokens and primitives instead of one-off controls or
  hard-coded theme logic.
- [ ] Components do not call `fetch`, hard-code backend URLs, or own product data
  caching.
- [ ] Data-bound components render the applicable `loading`, `empty`, `error`,
  and `populated` states.
- [ ] Naming and exports follow the conventions in `CONTRIBUTING.md`.

## Stories And Tests

- [ ] Shared composites changed by this PR include or update colocated
  `*.stories.svelte` files.
- [ ] Stories use fixtures and cover the applicable state matrix.
- [ ] Changed Svelte shared components include or update Vitest component tests.
- [ ] The relevant `testing.md` row was run or explicitly recorded as deferred:
  [`docs/specs/testing.md`](../../../../docs/specs/testing.md).

## Review Evidence

- [ ] Reviewer checked this PR against
  [`docs/specs/frontend.md`](../../../../docs/specs/frontend.md) sections 5-8.
- [ ] Reviewer confirmed any documentation links changed by this PR resolve.
- [ ] Runtime evidence, screenshots, or built-story output are attached when the
  changed artifact type requires them.
