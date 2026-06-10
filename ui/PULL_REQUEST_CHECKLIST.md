# NullHub UI Pull Request Checklist

Use this checklist for changes under `ui/`. It is scoped to frontend component
and route work; backend, runtime, deployment, and Docker changes follow their
own parent monorepo specs.

## Scope

- [ ] The PR references the owning bead and canonical spec section.
- [ ] The change stays within the bead scope and does not add unrelated
      component, route, runner, or API behavior.
- [ ] User-facing labels match the product vocabulary in `docs/specs/product.md`.

## Component Layering

- [ ] New or changed components are in the right layer from
      `CONTRIBUTING.md`: primitive, shared composite, or domain composite.
- [ ] No app composite reimplements a base primitive that already exists under
      `src/lib/components/ui/`.
- [ ] Any new primitive was added through the shadcn-svelte CLI, not hand-coded.
- [ ] Domain components do not import another domain directory's internals.

## Stories And Tests

- [ ] Reusable shared composites have a colocated `*.stories.svelte` file.
- [ ] Data-bound stories cover `loading`, `empty`, `error`, and `populated`
      states where applicable.
- [ ] Component tests assert behavior or contract shape, not only that rendering
      does not throw.
- [ ] Required commands from `docs/specs/testing.md` were run, or the PR states
      which runner install bead blocks that layer.

## Data And State

- [ ] Components do not call `fetch` directly; product data goes through
      `src/lib/api/` typed clients.
- [ ] Product reads are space-scoped with the current `?space=<id>` convention
      when the touched path reads product data.
- [ ] API failures drive visible error states instead of blank UI.
- [ ] Mutations rely on the API client's cache invalidation behavior rather than
      adding component-local request caches.

## Styling And Accessibility

- [ ] Components consume design tokens through Tailwind classes or CSS variables;
      no new hard-coded color literals were added in `.svelte` files.
- [ ] Interactive controls use existing primitives and expose accessible labels,
      names, or text.
- [ ] Loading and empty states preserve layout stability and do not hide primary
      actions unexpectedly.

## Exports And Imports

- [ ] App composites are imported by explicit `$lib/components/...` file paths.
- [ ] shadcn primitives use their generated `index.ts` exports where available.
- [ ] No broad app component barrel was introduced without a dedicated task.
