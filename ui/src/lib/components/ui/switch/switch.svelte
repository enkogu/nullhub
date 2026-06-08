<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    disabled = false,
    class: className,
    ...restProps
  }: WithElementRef<HTMLButtonAttributes> & { checked?: boolean; disabled?: boolean } = $props();
</script>

<button
  bind:this={ref}
  type="button"
  role="switch"
  aria-checked={checked}
  data-state={checked ? "checked" : "unchecked"}
  {disabled}
  data-slot="switch"
  class={cn(
    "focus-visible:ring-ring/50 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
    checked ? "bg-primary" : "bg-input",
    className,
  )}
  onclick={() => {
    if (!disabled) checked = !checked;
  }}
  {...restProps}
>
  <span
    class={cn(
      "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
      checked ? "translate-x-4" : "translate-x-0.5",
    )}
  ></span>
</button>
