# NullHub UI Component Conventions

This file is the local contributor guide for NullHub UI component work. The
canonical policy owners remain the parent monorepo specs:

- `docs/specs/frontend.md` owns the component layer model, Storybook scope, and
  API client rules.
- `docs/specs/testing.md` owns the required test commands and evidence policy.
- `docs/specs/product.md` owns product vocabulary and navigation.

If this guide and a canonical spec disagree, update the canonical spec first and
then bring this file back into alignment.

## Component Layers

Place components in the lowest layer that matches their responsibility:

| Layer | Path | Use for |
|---|---|---|
| UI primitives | `src/lib/components/ui/` | shadcn-svelte base controls only. |
| Shared composites | `src/lib/components/*.svelte` | reusable app components built on primitives. |
| Domain composites | `src/lib/components/<domain>/` | surface-specific components for one domain. |

Rules:

- Do not hand-author or vendor primitive files under `src/lib/components/ui/`.
  Add missing primitives with the shadcn-svelte CLI.
- Shared and domain composites must build on the `ui/` primitives when a
  primitive exists. Do not reimplement base buttons, dialogs, tabs, selects,
  inputs, tooltips, or similar controls.
- Domain composites may import primitives and shared composites. They must not
  import another domain directory's internals.
- Do not add new feature work to a component over 500 lines without first
  extracting the section being touched into a child component, unless the change
  is a pure bug fix.

## Stories And Tests

Every reusable shared composite needs a story and a component test when it is
added or changed.

- Put stories beside the component using the same base name:
  `ComponentName.stories.svelte`.
- Data-bound stories must render every state the component supports, including
  `loading`, `empty`, `error`, and `populated` where applicable.
- Stories use fixtures, not a live backend.
- The component test must assert rendered behavior or contract shape. A
  render-only smoke is not enough.
- Vendored shadcn primitives only need stories when locally modified.
- Route-local one-off components are exempt until promoted to shared use.
- If a required runner is not installed yet, the PR must name the missing test
  layer and the owning install bead instead of claiming the layer passed.

## Data Access

Components do not call `fetch` directly.

- Put product data access in a typed client under `src/lib/api/`.
- Product reads must be space-scoped using the current `?space=<id>` convention.
- Component `loading`, `empty`, `error`, and `populated` states must be driven by
  the typed client result, including API errors and circuit-breaker errors.
- Do not add component-local request caches on top of the shared API client.

## Naming

Use names that identify the component role and product surface without leaking
implementation vocabulary into user-facing UI.

- Svelte composite files use PascalCase: `StatusBadge.svelte`,
  `LoopRunsCenter.svelte`.
- Domain directories use lowercase domain names: `loops/`, `nullboiler/`,
  `nulltickets/`.
- shadcn primitive directories and files keep the generated lowercase names:
  `button/button.svelte`, `dropdown-menu/index.ts`.
- Stories and tests keep the component base name:
  `StatusBadge.stories.svelte`, `StatusBadge.browser.test.ts`.
- User-facing labels follow `docs/specs/product.md`: use `Loops` for
  ticket-backed repeat cycles and `Workflows` for graph orchestration. Do not
  introduce `process`, `pipeline`, or `playbook` labels for those concepts.

## Exports And Imports

Follow the existing local export style:

- Import shared and domain Svelte composites by file path from
  `$lib/components/...`.
- Do not add broad component barrel files for app composites unless a dedicated
  task introduces that pattern.
- shadcn primitives are imported through their generated `index.ts` modules
  where those modules already exist.
- Keep TypeScript helpers near the component family they support unless they are
  true API clients or shared utilities.

## Review Checklist

Use `PULL_REQUEST_CHECKLIST.md` for every UI component PR.
