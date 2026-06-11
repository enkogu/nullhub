<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  onMount(() => {
    void goto("/work/today", { replaceState: true });
  });
</script>

<div class="work-redirect">Loading Work…</div>

<style>
  .work-redirect {
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
</style>
