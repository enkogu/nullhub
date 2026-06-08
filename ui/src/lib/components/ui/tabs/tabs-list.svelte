<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";

  let { class: className = "", children }: { class?: string; children?: Snippet } = $props();
</script>

<div
  data-slot="tabs-list"
  role="tablist"
  class={cn(
    "flex items-center gap-1 overflow-x-auto border-b border-border",
    className,
  )}
>
  {@render children?.()}
</div>
