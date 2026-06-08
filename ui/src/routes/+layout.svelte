<script lang="ts">
  import '../app.css';
  import '../shadcn.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import AppSidebar from '$lib/components/app-sidebar.svelte';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import { headerToolbar } from '$lib/headerToolbar';
  import { redirectToPreferredOrigin } from '$lib/nullhubAccess';

  let { children } = $props();

  const routeTitles: { test: (path: string) => boolean; title: string; section?: string }[] = [
    { test: (path) => path === '/', title: 'Work' },
    { test: (path) => path === '/dashboard', title: 'Dashboard' },
    { test: (path) => path === '/mission-control', title: 'Mission Control' },
    { test: (path) => path === '/work', title: 'Board', section: 'Work' },
    { test: (path) => path.startsWith('/work/tasks'), title: 'Tasks', section: 'Work' },
    { test: (path) => path.startsWith('/work/processes'), title: 'Processes', section: 'Work' },
    { test: (path) => path.startsWith('/work/task-flows'), title: 'Processes', section: 'Work' },
    { test: (path) => path.startsWith('/work/planner'), title: 'Planner', section: 'Work' },
    { test: (path) => path.startsWith('/work/dependencies'), title: 'Dependencies', section: 'Work' },
    { test: (path) => path.startsWith('/task-flows'), title: 'Processes', section: 'Work' },
    { test: (path) => path.startsWith('/automations/workflows'), title: 'Workflows', section: 'Automations' },
    { test: (path) => path.startsWith('/automations/runs'), title: 'Runs', section: 'Automations' },
    { test: (path) => path.startsWith('/automations'), title: 'Automations', section: 'Automations' },
    { test: (path) => path.startsWith('/agents/roles'), title: 'Roles', section: 'Agents' },
    { test: (path) => path.startsWith('/agents/profiles'), title: 'Profiles', section: 'Agents' },
    { test: (path) => path.startsWith('/agents'), title: 'Agents' },
    { test: (path) => path.startsWith('/capabilities/skills'), title: 'Skills', section: 'Capabilities' },
    { test: (path) => path.startsWith('/capabilities/mcp'), title: 'MCP', section: 'Capabilities' },
    { test: (path) => path.startsWith('/capabilities/hooks'), title: 'Hooks', section: 'Capabilities' },
    { test: (path) => path.startsWith('/capabilities/instructions'), title: 'Instructions', section: 'Capabilities' },
    { test: (path) => path.startsWith('/capabilities/memory'), title: 'Memory', section: 'Capabilities' },
    { test: (path) => path.startsWith('/capabilities/schedules'), title: 'Schedules', section: 'Capabilities' },
    { test: (path) => path.startsWith('/capabilities'), title: 'Skills', section: 'Capabilities' },
    { test: (path) => path === '/dispatch', title: 'Monitor', section: 'Dispatch' },
    { test: (path) => path.startsWith('/dispatch/queue'), title: 'Queue', section: 'Dispatch' },
    { test: (path) => path.startsWith('/dispatch/runs'), title: 'Runs', section: 'Dispatch' },
    { test: (path) => path.startsWith('/dispatch/failures'), title: 'Failures', section: 'Dispatch' },
    { test: (path) => path.startsWith('/dispatch/telemetry'), title: 'Telemetry', section: 'Dispatch' },
    { test: (path) => path.startsWith('/artifacts'), title: 'Artifacts' },
    { test: (path) => path.startsWith('/inventory/components'), title: 'Components', section: 'Inventory' },
    { test: (path) => path.startsWith('/inventory/instances'), title: 'Instances', section: 'Inventory' },
    { test: (path) => path.startsWith('/inventory/providers'), title: 'Providers', section: 'Inventory' },
    { test: (path) => path.startsWith('/inventory/channels'), title: 'Channels', section: 'Inventory' },
    { test: (path) => path.startsWith('/install'), title: 'Install Component' },
    { test: (path) => path.startsWith('/providers'), title: 'Providers' },
    { test: (path) => path.startsWith('/channels'), title: 'Channels' },
    { test: (path) => path.startsWith('/configs'), title: 'Configs' },
    { test: (path) => path.startsWith('/nullboiler/workflows'), title: 'Workflows', section: 'Automations' },
    { test: (path) => path.startsWith('/nullboiler/runs'), title: 'Runs', section: 'Automations' },
    { test: (path) => path.startsWith('/nullboiler'), title: 'Automations', section: 'Automations' },
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
      if (component === 'nullclaw') {
        return name
          ? [{ label: 'Agents', href: '/agents' }, { label: decodeSegment(name) }]
          : [{ label: 'Agents' }];
      }
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
  let visibleCrumbs = $derived($headerToolbar?.crumbLabel ? [...crumbs, { label: $headerToolbar.crumbLabel }] : crumbs);

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
        <div class="header-content">
          <div class="header-breadcrumb">
            <Sidebar.Trigger class="-ms-1" />
            <Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb.Root>
              <Breadcrumb.List>
                {#each visibleCrumbs as crumb, index (index)}
                  <Breadcrumb.Item class={index === 0 && visibleCrumbs.length > 1 ? 'hidden md:block' : ''}>
                    {#if crumb.href && index < visibleCrumbs.length - 1}
                      <Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
                    {:else}
                      <Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
                    {/if}
                  </Breadcrumb.Item>
                  {#if index < visibleCrumbs.length - 1}
                    <Breadcrumb.Separator class={index === 0 ? 'hidden md:block' : ''} />
                  {/if}
                {/each}
              </Breadcrumb.List>
            </Breadcrumb.Root>
          </div>
          {#if $headerToolbar}
            <div class="route-toolbar" aria-label="Page actions">
              {#if $headerToolbar.path}
                <input
                  aria-label="Document path"
                  class:invalid={$headerToolbar.path.invalid}
                  value={$headerToolbar.path.value}
                  placeholder={$headerToolbar.path.placeholder}
                  oninput={(event) => $headerToolbar?.path?.onInput((event.currentTarget as HTMLInputElement).value)}
                />
              {/if}
              <div class="route-actions">
                {#each $headerToolbar.actions as action (action.id)}
                  <button
                    type="button"
                    class:active={action.active}
                    class:danger={action.danger}
                    class:primary={action.primary}
                    disabled={action.disabled}
                    onclick={() => action.onClick()}
                  >
                    {action.label}
                  </button>
                {/each}
              </div>
              {#if $headerToolbar.status}
                <span class:dirty={$headerToolbar.status.tone === 'dirty'} class:saving={$headerToolbar.status.tone === 'saving'} class:error={$headerToolbar.status.tone === 'error'} class="route-status">
                  {$headerToolbar.status.label}
                </span>
              {/if}
            </div>
          {/if}
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

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
    padding: 0 1rem;
  }

  .header-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .route-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .route-toolbar input {
    width: clamp(180px, 28vw, 520px);
    height: 32px;
    min-width: 120px;
    border: 1px solid var(--shadcn-border);
    border-radius: 6px;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    padding: 0 0.6rem;
    font: inherit;
    font-size: 0.875rem;
  }

  .route-toolbar input.invalid {
    border-color: var(--error);
  }

  .route-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .route-actions button {
    height: 32px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    padding: 0 0.65rem;
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .route-actions button:hover:not(:disabled) {
    background: var(--shadcn-accent);
  }

  .route-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .route-actions button.active {
    background: var(--shadcn-accent);
    border-color: var(--shadcn-accent);
    color: var(--shadcn-foreground);
  }

  .route-actions button.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }

  .route-actions button.danger {
    border-color: var(--error);
    color: var(--error);
  }

  .route-status {
    min-width: 42px;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    text-align: right;
    white-space: nowrap;
  }

  .route-status.dirty {
    color: var(--warning);
  }

  .route-status.saving {
    color: var(--accent);
  }

  .route-status.error {
    color: var(--error);
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

  @media (max-width: 768px) {
    .shadcn-app {
      padding: 0;
    }

    .app-header {
      height: auto;
      min-height: 4rem;
      padding-block: 0.5rem;
    }

    .header-content {
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .header-breadcrumb,
    .route-toolbar {
      flex: 1 1 100%;
    }

    .route-toolbar {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .shadcn-app :global([data-slot="sidebar-wrapper"]) {
      min-height: 100dvh;
      border: 0;
      border-radius: 0;
    }

    .real-content {
      padding: 1rem;
    }

    .route-toolbar input {
      flex: 1 1 180px;
      width: 100%;
    }

    .route-actions button {
      padding: 0 0.5rem;
    }
  }
</style>
