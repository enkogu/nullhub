<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";
  import { getTabsCtx } from "./tabs.svelte";

  let {
    value,
    class: className = "",
    onclick,
    children,
    ...restProps
  }: { value: string; class?: string; onclick?: (event: MouseEvent) => void; children?: Snippet } = $props();

  const ctx = getTabsCtx();
  const active = $derived(ctx.value() === value);
</script>

<button
  type="button"
  role="tab"
  aria-selected={active}
  data-slot="tabs-trigger"
  data-state={active ? "active" : "inactive"}
  class={cn(
    "relative -mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "border-foreground text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
    className,
  )}
  onclick={(event) => {
    ctx.set(value);
    onclick?.(event);
  }}
  {...restProps}
>
  {@render children?.()}
</button>
