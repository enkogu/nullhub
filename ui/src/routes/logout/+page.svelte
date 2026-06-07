<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";

  onMount(() => {
    if (!browser) return;

    try {
      localStorage.removeItem("pocketbase_auth");
      localStorage.removeItem("oauth_provider");
      localStorage.removeItem("nullhub-theme");
      localStorage.removeItem("nullhub-effects");
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }

    document.cookie = "pb_auth=; Path=/; SameSite=Lax; Max-Age=0";
    window.location.replace("/");
  });
</script>

<main class="logout-page">
  <p>Signing out...</p>
</main>

<style>
  .logout-page {
    display: grid;
    min-height: 100vh;
    place-items: center;
    background: var(--bg);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
</style>
