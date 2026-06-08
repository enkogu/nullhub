<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";
  import { getTabsCtx } from "./tabs.svelte";

  let {
    value,
    class: className = "",
    children,
  }: { value: string; class?: string; children?: Snippet } = $props();

  const ctx = getTabsCtx();
</script>

{#if ctx.value() === value}
  <div data-slot="tabs-content" role="tabpanel" class={cn("min-w-0", className)}>
    {@render children?.()}
  </div>
{/if}
