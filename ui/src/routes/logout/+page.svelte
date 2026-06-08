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
  <div class="logout-card">
    <span class="spinner" aria-hidden="true"></span>
    <p>Signing out…</p>
  </div>
</main>

<style>
  .logout-page {
    display: grid;
    min-height: 100vh;
    place-items: center;
    background: var(--shadcn-background);
    color: var(--shadcn-muted-foreground);
    font-family: var(--shadcn-font-sans);
  }

  .logout-card {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: 0.875rem;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--shadcn-border);
    border-top-color: var(--shadcn-foreground);
    border-radius: 9999px;
    animation: logout-spin 0.7s linear infinite;
  }

  @keyframes logout-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
