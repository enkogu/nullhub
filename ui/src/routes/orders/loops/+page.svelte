<script lang="ts">
  import { page } from "$app/stores";
  import LoopsWorkspace from "$lib/components/loops/LoopsWorkspace.svelte";

  const tabs = ["overview", "installed", "gallery"] as const;
  const requested = $page.url.searchParams.get("tab") as (typeof tabs)[number] | null;
  const initialTab = requested && tabs.includes(requested) ? requested : "overview";
</script>

<LoopsWorkspace {initialTab} />
