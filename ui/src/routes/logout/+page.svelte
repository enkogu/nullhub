<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { clearLocalAuth } from "$lib/sessionState";

  onMount(() => {
    if (!browser) return;

    try {
      clearLocalAuth();
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }

    document.cookie = "pb_auth=; Path=/; SameSite=Lax; Max-Age=0";
    window.location.replace("/");
  });
</script>
