# NullHub UI Component Conventions

This package-local guide turns the canonical frontend specs into reviewable
rules for component-library changes. If this file conflicts with
[`docs/specs/frontend.md`](../../../../docs/specs/frontend.md),
[`docs/specs/testing.md`](../../../../docs/specs/testing.md), or
[`docs/specs/product.md`](../../../../docs/specs/product.md), the specs win.

## Component Layers

Use the three-layer model from `frontend.md` section 6:

| Layer | Location | Rule |
|---|---|---|
| Base primitives | `src/lib/components/ui/**` | shadcn-svelte primitives only. Add missing primitives through the shadcn-svelte CLI; do not hand-author primitives or vendor another kit. |
| App composites | `src/lib/components/*.svelte` | Cross-surface components built from primitives, typed props, and package tokens. |
| Domain composites | `src/lib/components/<domain>/*.svelte` | Surface-specific composites that may import primitives and app composites, but not another domain's internals. |

Domain directories should stay lowercase and match an owned product surface or
component family. Do not introduce top-level IA concepts that conflict with the
eight product navigation items in `product.md` section 3.

## Authoring Rules

- New Svelte components use runes mode (`$state`, `$derived`, `$props`,
  `$effect`). Do not add legacy `export let` or reactive `$:` blocks in new
  components.
- Components do not call `fetch` directly, hard-code `127.0.0.1`, or build raw
  API URLs. Put product data access in typed clients under `src/lib/api/`.
- Reads of product data must be space-scoped by the client layer. Until the API
  routing changes, new read paths use the `?space=<id>` convention described in
  `product.md` and `frontend.md`.
- Components render explicit `loading`, `empty`, `error`, and `populated` states
  when those states apply. API failures, including circuit-breaker failures from
  `ApiRequestError`, must feed the component's error state.
- Consume design tokens from the package styles. Do not branch on theme in
  component script, duplicate token values, or introduce one-off base controls.
- Do not add new behavior inside a component over 500 lines unless the touched
  section is first extracted into a child component as required by
  `frontend.md` section 5.

## Naming And Exports

- Shared and domain Svelte components use `PascalCase.svelte`.
- Existing shell adapters with lowercase or kebab-case names may keep that name;
  do not rename them as drive-by cleanup.
- UI primitives keep the shadcn-svelte export style: each primitive directory
  exposes an `index.ts`, and callers import from
  `$lib/components/ui/<primitive>`.
- Shared composites are imported by direct component path unless a domain already
  has a local `index.ts`. Do not create a broad cross-domain barrel that hides
  ownership boundaries.
- TypeScript helpers use named exports. Avoid default exports for helpers,
  schemas, and client utilities.

## Story And Test Contract

- Every shared composite under `src/lib/components` that is reused across
  surfaces ships a colocated `*.stories.svelte` story. A PR that changes the
  component changes the story.
- Stories for data-bound components use fixtures, not a live backend, and cover
  the applicable `loading`, `empty`, `error`, and `populated` states.
- Vendored shadcn primitives under `src/lib/components/ui/**` need stories only
  when locally modified.
- A changed Svelte shared component must also include a Vitest component test per
  the `Svelte shared component` row in `testing.md`.
- Route and shell changes use the `Route / shell UI` row in `testing.md`; API
  client changes use the `API client` row.

Use [`PULL_REQUEST_CHECKLIST.md`](PULL_REQUEST_CHECKLIST.md) before submitting a
UI component PR.
