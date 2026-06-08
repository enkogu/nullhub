<script lang="ts">
  import type { HTMLLabelAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLLabelAttributes> = $props();
</script>

<label
  bind:this={ref}
  data-slot="label"
  class={cn(
    "flex select-none items-center gap-2 text-sm font-medium leading-none text-foreground",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</label>
