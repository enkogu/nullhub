<script lang="ts">
  import '../app.css';
  import '../shadcn.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import AppSidebar from '$lib/components/app-sidebar.svelte';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import { redirectToPreferredOrigin } from '$lib/nullhubAccess';

  let { children } = $props();

  const routeTitles: { test: (path: string) => boolean; title: string; section?: string }[] = [
    { test: (path) => path === '/', title: 'System Status' },
    { test: (path) => path === '/dashboard', title: 'Dashboard' },
    { test: (path) => path === '/mission-control', title: 'Mission Control' },
    { test: (path) => path.startsWith('/install'), title: 'Install Component' },
    { test: (path) => path.startsWith('/providers'), title: 'Providers' },
    { test: (path) => path.startsWith('/channels'), title: 'Channels' },
    { test: (path) => path.startsWith('/configs'), title: 'Configs' },
    { test: (path) => path.startsWith('/nullboiler/workflows'), title: 'Workflows', section: 'NullBoiler' },
    { test: (path) => path.startsWith('/nullboiler/runs'), title: 'Runs', section: 'NullBoiler' },
    { test: (path) => path.startsWith('/nullboiler'), title: 'Dashboard', section: 'NullBoiler' },
    { test: (path) => path.startsWith('/nulltickets/store'), title: 'Store' },
    { test: (path) => path.startsWith('/nullwatch'), title: 'Observability' },
    { test: (path) => path.startsWith('/report'), title: 'Report Issue' },
    { test: (path) => path.startsWith('/settings'), title: 'Settings' },
  ];

  function decodeSegment(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function routeCrumbs(path: string): { label: string; href?: string }[] {
    if (path.startsWith('/instances/')) {
      const [, , component = '', name = ''] = path.split('/');
      const componentLabel = decodeSegment(component);
      const crumbs = [
        { label: 'Instances', href: '/' },
        { label: componentLabel || 'Component', href: component ? `/instances/${component}` : undefined },
      ];
      if (name) crumbs.push({ label: decodeSegment(name) });
      return crumbs;
    }

    const match = routeTitles.find((item) => item.test(path));
    if (!match) return [{ label: 'NullHub' }, { label: path }];
    if (match.section) return [{ label: match.section }, { label: match.title }];
    return [{ label: 'NullHub' }, { label: match.title }];
  }

  let crumbs = $derived(routeCrumbs($page.url.pathname));

  onMount(() => {
    void redirectToPreferredOrigin(window.location);
  });
</script>

<div class="shadcn-app">
  <Sidebar.Provider class="app-shell">
    <AppSidebar />
    <Sidebar.Inset>
      <header
        class="app-header flex h-16 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
      >
        <div class="flex min-w-0 items-center gap-2 px-4">
          <Sidebar.Trigger class="-ms-1" />
          <Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb.Root>
            <Breadcrumb.List>
              {#each crumbs as crumb, index (index)}
                <Breadcrumb.Item class={index === 0 && crumbs.length > 1 ? 'hidden md:block' : ''}>
                  {#if crumb.href && index < crumbs.length - 1}
                    <Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
                  {:else}
                    <Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
                  {/if}
                </Breadcrumb.Item>
                {#if index < crumbs.length - 1}
                  <Breadcrumb.Separator class={index === 0 ? 'hidden md:block' : ''} />
                {/if}
              {/each}
            </Breadcrumb.List>
          </Breadcrumb.Root>
        </div>
      </header>
      <main class="real-content">
        {@render children()}
      </main>
    </Sidebar.Inset>
  </Sidebar.Provider>
</div>

<style>
  .shadcn-app {
    height: 100dvh;
    overflow: hidden;
    padding: 0;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font-family: var(--shadcn-font-sans);
  }

  .real-content {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    padding: 1.5rem;
    background: var(--shadcn-background);
  }

  .shadcn-app :global([data-slot="sidebar-wrapper"]) {
    position: relative;
    height: 100dvh;
    min-height: 100dvh;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    --accent: var(--shadcn-foreground);
    --accent-dim: var(--shadcn-muted-foreground);
    --bg: var(--shadcn-background);
    --bg-hover: var(--shadcn-accent);
    --bg-surface: var(--shadcn-background);
    --border: var(--shadcn-border);
    --border-glow: transparent;
    --text-glow: none;
  }

  .shadcn-app :global([data-slot="sidebar-container"]) {
    position: absolute;
    inset-block: 0;
    height: 100%;
    overflow: hidden;
  }

  .shadcn-app :global([data-slot="sidebar-inner"]) {
    height: 100%;
    overflow: hidden;
  }

  .shadcn-app :global([data-slot="sidebar-inset"]) {
    height: 100dvh;
    min-width: 0;
    overflow: hidden;
  }

  .app-header {
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .shadcn-app :global([data-slot="sidebar-container"][data-side="left"]) {
    left: 0;
    right: auto;
  }

  .shadcn-app :global([data-slot="sidebar-container"][data-side="right"]) {
    right: 0;
    left: auto;
  }

  .shadcn-app :global([data-slot="sidebar-menu-button"]),
  .shadcn-app :global([data-slot="sidebar-menu-sub-button"]),
  .shadcn-app :global([data-slot="sidebar-trigger"]) {
    border: 0 !important;
    box-shadow: none !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
    text-transform: none !important;
  }

  .shadcn-app :global([data-slot="sidebar-wrapper"] button),
  .shadcn-app :global([data-slot="sidebar-wrapper"] a),
  .shadcn-app :global([data-slot="sidebar-wrapper"] input),
  .shadcn-app :global([data-slot="sidebar-wrapper"] select),
  .shadcn-app :global([data-slot="sidebar-wrapper"] textarea) {
    color: inherit;
    letter-spacing: 0;
    text-shadow: none;
    text-transform: none;
    backdrop-filter: none;
  }

  .shadcn-app :global([data-slot="sidebar-wrapper"] button:hover:not(:disabled)),
  .shadcn-app :global([data-slot="sidebar-wrapper"] a:hover) {
    box-shadow: none;
    text-decoration: none;
    text-shadow: none;
  }

  @media (max-width: 768px) {
    .shadcn-app {
      padding: 0;
    }

    .shadcn-app :global([data-slot="sidebar-wrapper"]) {
      min-height: 100dvh;
      border: 0;
      border-radius: 0;
    }

    .real-content {
      padding: 1rem;
    }
  }
</style>
