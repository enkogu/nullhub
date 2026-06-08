<script lang="ts" module>
  import { getContext, setContext } from "svelte";

  const KEY = Symbol("tabs");

  export type TabsCtx = { value: () => string; set: (v: string) => void };

  export function getTabsCtx(): TabsCtx {
    return getContext<TabsCtx>(KEY);
  }

  export function setTabsCtx(ctx: TabsCtx) {
    setContext(KEY, ctx);
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";

  let {
    value = $bindable(""),
    class: className = "",
    children,
  }: { value?: string; class?: string; children?: Snippet } = $props();

  setTabsCtx({
    value: () => value,
    set: (v: string) => (value = v),
  });
</script>

<div data-slot="tabs" class={cn("flex flex-col gap-4", className)}>
  {@render children?.()}
</div>
