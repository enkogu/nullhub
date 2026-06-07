<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { api } from "$lib/api/client";

  let hubOk = $state(true);
  let userEmail = $state("Signed in");
  let userInitial = $state("U");
  let accountMenuOpen = $state(false);

  let currentTheme = $state("theme-light");
  let effectsEnabled = $state(false);
  let initialized = $state(false);

  function readCurrentUser() {
    if (!browser) return;

    try {
      const stored = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
      const user = stored.record || stored.model || {};
      const email = typeof user.email === "string" ? user.email.trim() : "";
      const name = typeof user.name === "string" ? user.name.trim() : "";
      const label = email || name || "Signed in";
      userEmail = label;
      userInitial = (email || name || "U").trim().charAt(0).toUpperCase();
    } catch {
      userEmail = "Signed in";
      userInitial = "U";
    }
  }

  onMount(() => {
    let closeAccountMenu: ((event: MouseEvent) => void) | null = null;

    if (browser) {
      readCurrentUser();
      const savedTheme = localStorage.getItem("nullhub-theme");
      const savedEffects = localStorage.getItem("nullhub-effects");
      if (savedTheme) currentTheme = savedTheme;
      if (savedEffects === "true") effectsEnabled = true;
      initialized = true;

      closeAccountMenu = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest(".account-menu")) accountMenuOpen = false;
      };
      document.addEventListener("click", closeAccountMenu);
    }

    async function check() {
      try {
        await api.getStatus();
        hubOk = true;
      } catch {
        hubOk = false;
      }
    }
    check();
    const interval = setInterval(check, 10000);
    return () => {
      clearInterval(interval);
      if (closeAccountMenu) document.removeEventListener("click", closeAccountMenu);
    };
  });

  $effect(() => {
    if (browser && initialized) {
      localStorage.setItem("nullhub-theme", currentTheme);
      localStorage.setItem("nullhub-effects", effectsEnabled.toString());

      const body = document.body;
      const root = document.documentElement;
      const themeClasses = [
        "theme-matrix",
        "theme-8bit-lobster",
        "theme-8bit-lobster-light",
        "theme-dracula",
        "theme-synthwave",
        "theme-amber",
        "theme-light",
      ];
      body.classList.remove(...themeClasses);
      root.classList.remove(...themeClasses);
      if (currentTheme) {
        body.classList.add(currentTheme);
        root.classList.add(currentTheme);
      }

      if (effectsEnabled) {
        body.classList.remove("effects-disabled");
      } else {
        body.classList.add("effects-disabled");
      }
    }
  });
</script>

<header class="topbar">
  <div class="topbar-right">
    <div class="theme-controls">
      <label class="effect-toggle" title="Toggle CRT Effects">
        <input type="checkbox" bind:checked={effectsEnabled} />
        CRT FX
      </label>
      <select bind:value={currentTheme} class="theme-select" title="Theme">
        <option value="theme-matrix">Matrix</option>
        <option value="theme-8bit-lobster">Lobster</option>
        <option value="theme-8bit-lobster-light">Lobster Light</option>
        <option value="theme-dracula">Dracula</option>
        <option value="theme-synthwave">Synthwave</option>
        <option value="theme-amber">Amber</option>
        <option value="theme-light">Light</option>
      </select>
    </div>
    <div class="hub-status">
      <span class="status-dot" class:running={hubOk}></span>
      <span>{hubOk ? "Hub Running" : "Hub Unreachable"}</span>
    </div>
    <div class="account-menu">
      <button
        class="account-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={accountMenuOpen}
        onclick={(event) => {
          event.stopPropagation();
          accountMenuOpen = !accountMenuOpen;
        }}
      >
        <span class="avatar" aria-hidden="true">{userInitial}</span>
        <span class="account-email">{userEmail}</span>
        <span class="account-caret" aria-hidden="true">v</span>
      </button>
      {#if accountMenuOpen}
        <div class="account-panel" role="menu">
          <div class="account-panel-user">
            <span class="avatar large" aria-hidden="true">{userInitial}</span>
            <span>{userEmail}</span>
          </div>
          <a class="sign-out" href="/logout" role="menuitem">Sign out</a>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0.875rem 1.5rem;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    backdrop-filter: blur(4px);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .theme-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-right: 1.5rem;
    border-right: 1px dashed var(--border);
  }

  :global(body.theme-8bit-lobster) .theme-controls,
  :global(body.theme-8bit-lobster-light) .theme-controls {
    border-right-style: solid;
  }

  .effect-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .effect-toggle input[type="checkbox"] {
    appearance: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    border-radius: var(--radius-sm);
    position: relative;
    cursor: pointer;
    margin: 0;
    padding: 0;
  }

  .effect-toggle input[type="checkbox"]:checked {
    background: color-mix(in srgb, var(--fx-accent) 20%, transparent);
    border-color: var(--fx-accent);
    box-shadow: inset 0 0 5px var(--fx-accent);
  }

  .effect-toggle input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 8px;
    height: 8px;
    background: var(--fx-accent);
    border-radius: 1px;
    box-shadow: 0 0 3px var(--fx-accent-glow);
  }

  .theme-select {
    background: color-mix(in srgb, var(--bg-surface) 50%, transparent);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.25rem 0.5rem;
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
  }

  .theme-select:focus-visible,
  .theme-select:hover {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--border-glow);
  }

  .theme-select option {
    background: var(--bg);
    color: var(--fg);
  }

  .hub-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .account-menu {
    position: relative;
  }

  .account-trigger {
    display: inline-flex;
    max-width: 19rem;
    min-height: 2.25rem;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 0.6rem 0 0.35rem;
    background: color-mix(in srgb, var(--bg-surface) 50%, transparent);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0;
    text-transform: none;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
  }

  .account-trigger:focus-visible,
  .account-trigger:hover {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--border-glow);
  }

  .avatar {
    display: inline-grid;
    width: 1.6rem;
    height: 1.6rem;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 16%, var(--bg-surface));
    color: var(--fg);
    font-size: 0.78rem;
    line-height: 1;
  }

  .avatar.large {
    width: 2rem;
    height: 2rem;
    font-size: 0.9rem;
  }

  .account-email {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-caret {
    color: var(--fg-dim);
    font-size: 0.85rem;
    line-height: 1;
  }

  .account-panel {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 50;
    display: grid;
    width: min(20rem, calc(100vw - 2rem));
    gap: 0.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem;
    background: var(--bg);
    box-shadow: 0 16px 40px color-mix(in srgb, var(--bg) 65%, transparent);
  }

  .account-panel-user {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    color: var(--fg);
    font-size: 0.8rem;
    letter-spacing: 0;
    text-transform: none;
  }

  .account-panel-user span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sign-out {
    display: inline-flex;
    min-height: 2rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 0.65rem;
    background: color-mix(in srgb, var(--bg-surface) 50%, transparent);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 1px;
    text-decoration: none;
    text-transform: uppercase;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
  }

  .sign-out:focus-visible,
  .sign-out:hover {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--border-glow);
  }

  .status-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: var(--radius);
    background: var(--error);
    box-shadow: 0 0 6px var(--error);
    flex-shrink: 0;
  }

  .status-dot.running {
    background: var(--success);
    box-shadow: 0 0 10px var(--success);
  }

  @media (max-width: 760px) {
    .topbar {
      padding: 0.75rem 1rem;
    }

    .topbar-right {
      width: 100%;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .theme-controls {
      gap: 0.6rem;
      padding-right: 0.75rem;
    }

    .hub-status span:last-child {
      display: none;
    }

    .account-trigger {
      max-width: 12rem;
    }
  }
</style>
