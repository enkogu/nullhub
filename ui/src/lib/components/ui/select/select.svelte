<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLSelectAttributes> = $props();
</script>

<div class={cn("relative inline-flex items-center", className || "w-full")}>
  <select
    bind:this={ref}
    data-slot="select"
    class={cn(
      "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full cursor-pointer appearance-none rounded-md border pl-3 pr-8 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
    )}
    bind:value
    {...restProps}
  >
    {@render children?.()}
  </select>
  <ChevronDownIcon class="text-muted-foreground pointer-events-none absolute right-2.5 size-4" />
</div>
