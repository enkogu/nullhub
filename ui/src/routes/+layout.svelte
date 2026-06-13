<script lang="ts">
  import '../app.css';
  import '../shadcn.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, untrack } from 'svelte';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import GlobalAgentChatDrawer from '$lib/components/GlobalAgentChatDrawer.svelte';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import { ALL_SPACES_STORAGE_VALUE, SELECTED_SPACE_STORAGE_KEY, SPACE_QUERY_PARAM, selectedSpaceFromEnvironment, type Space } from '$lib/api/spaces';
  import { headerToolbar } from '$lib/headerToolbar';
  import { redirectToPreferredOrigin } from '$lib/nullhubAccess';
  import { needsYouStore } from '$lib/stores/needsYou.svelte';
  import { spacesStore } from '$lib/stores/spaces.svelte';
  import PanelRightCloseIcon from '@lucide/svelte/icons/panel-right-close';
  import PanelRightOpenIcon from '@lucide/svelte/icons/panel-right-open';
  import SearchIcon from '@lucide/svelte/icons/search';

  let { children } = $props();
  let agentChatOpen = $state(false);
  let commandPaletteOpen = $state(false);

  const routeTitles: { test: (path: string) => boolean; title: string; section?: string }[] = [
    { test: (path) => path === '/', title: 'Home' },
    { test: (path) => path.startsWith('/inbox'), title: 'Inbox' },
    { test: (path) => path === '/work', title: 'Board', section: 'Work' },
    { test: (path) => path.startsWith('/work/tasks'), title: 'Tasks', section: 'Work' },
    { test: (path) => path.startsWith('/work/processes'), title: 'Task Flows', section: 'Work' },
    { test: (path) => path.startsWith('/work/task-flows'), title: 'Task Flows', section: 'Work' },
    { test: (path) => path.startsWith('/work/planner'), title: 'Planner', section: 'Work' },
    { test: (path) => path.startsWith('/work/dependencies'), title: 'Dependencies', section: 'Work' },
    { test: (path) => path.startsWith('/work/live'), title: 'Live', section: 'Work' },
    { test: (path) => path.startsWith('/work/dispatch/queue'), title: 'Dispatch Queue', section: 'Work' },
    { test: (path) => path.startsWith('/work/dispatch/runs'), title: 'Dispatch Runs', section: 'Work' },
    { test: (path) => path.startsWith('/work/dispatch/failures'), title: 'Dispatch Failures', section: 'Work' },
    { test: (path) => path.startsWith('/work/dispatch/telemetry'), title: 'Dispatch Telemetry', section: 'Work' },
    { test: (path) => path.startsWith('/work/dispatch'), title: 'Dispatch', section: 'Work' },
    { test: (path) => path.startsWith('/work/activity'), title: 'Activity', section: 'Work' },
    { test: (path) => path.startsWith('/work/mission-control'), title: 'Mission Control', section: 'Work' },
    { test: (path) => path.startsWith('/work/runs'), title: 'Run Detail', section: 'Work' },
    { test: (path) => path.startsWith('/work/loops/runs'), title: 'Loop Runs', section: 'Work' },
    { test: (path) => path.startsWith('/work/artifacts'), title: 'Artifacts', section: 'Work' },
    { test: (path) => path.startsWith('/work/reports'), title: 'Reports', section: 'Work' },
    { test: (path) => path.startsWith('/orders/loops/library'), title: 'Loop Library', section: 'Orders' },
    { test: (path) => path.startsWith('/orders/loops'), title: 'Loops', section: 'Orders' },
    { test: (path) => path.startsWith('/orders/task-flows'), title: 'Task Flows', section: 'Orders' },
    { test: (path) => path.startsWith('/orders/workflows/runs'), title: 'Workflow Runs', section: 'Orders' },
    { test: (path) => path.startsWith('/orders/workflows'), title: 'Workflows', section: 'Orders' },
    { test: (path) => path.startsWith('/orders'), title: 'Orders' },
    { test: (path) => path.startsWith('/team/agents/roles'), title: 'Roles', section: 'Team' },
    { test: (path) => path.startsWith('/team/agents/profiles'), title: 'Profiles', section: 'Team' },
    { test: (path) => path.startsWith('/team/agents'), title: 'Agents', section: 'Team' },
    { test: (path) => path.startsWith('/team/capabilities/skills'), title: 'Skills', section: 'Team' },
    { test: (path) => path.startsWith('/team/capabilities/mcp'), title: 'MCP', section: 'Team' },
    { test: (path) => path.startsWith('/team/capabilities/hooks'), title: 'Hooks', section: 'Team' },
    { test: (path) => path.startsWith('/team/capabilities/instructions'), title: 'Instructions', section: 'Team' },
    { test: (path) => path.startsWith('/team/capabilities/memory'), title: 'Memory', section: 'Team' },
    { test: (path) => path.startsWith('/team/capabilities/schedules'), title: 'Schedules', section: 'Team' },
    { test: (path) => path.startsWith('/team/capabilities'), title: 'Capabilities', section: 'Team' },
    { test: (path) => path.startsWith('/team/instances'), title: 'Instances', section: 'Team' },
    { test: (path) => path.startsWith('/team'), title: 'Team' },
    { test: (path) => path.startsWith('/spaces/new'), title: 'New Space', section: 'Spaces' },
    { test: (path) => path.startsWith('/market/install'), title: 'Install Component', section: 'Market' },
    { test: (path) => path.startsWith('/market/components'), title: 'Components', section: 'Market' },
    { test: (path) => path.startsWith('/market/loops'), title: 'Loop Marketplace', section: 'Market' },
    { test: (path) => path.startsWith('/market/nulltickets/store'), title: 'Store', section: 'Market' },
    { test: (path) => path.startsWith('/market'), title: 'Market' },
    { test: (path) => path.startsWith('/system/providers'), title: 'Providers', section: 'System' },
    { test: (path) => path.startsWith('/system/channels'), title: 'Channels', section: 'System' },
    { test: (path) => path.startsWith('/system/configs'), title: 'Configs', section: 'System' },
    { test: (path) => path.startsWith('/system/usage'), title: 'Usage', section: 'System' },
    { test: (path) => path.startsWith('/system/settings'), title: 'Settings', section: 'System' },
    { test: (path) => path.startsWith('/system/observability'), title: 'Observability', section: 'System' },
    { test: (path) => path.startsWith('/system'), title: 'System' },
  ];

  function decodeSegment(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function routeCrumbs(path: string): { label: string; href?: string }[] {
    const instancePrefix = path.startsWith('/team/instances/')
      ? '/team/instances'
      : path.startsWith('/instances/')
        ? '/instances'
        : '';

    if (instancePrefix) {
      const [component = '', name = ''] = path.slice(instancePrefix.length + 1).split('/');
      if (component === 'nullclaw') {
        return name
          ? [{ label: 'Team', href: '/team' }, { label: 'Agents', href: '/team/agents' }, { label: decodeSegment(name) }]
          : [{ label: 'Team', href: '/team' }, { label: 'Agents' }];
      }
      const componentLabel = decodeSegment(component);
      const crumbs: { label: string; href?: string }[] = [
        { label: 'Team', href: '/team' },
        { label: 'Instances', href: '/team/instances' },
        { label: componentLabel || 'Component', href: component ? `/team/instances/${component}` : undefined },
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
  let isLogoutRoute = $derived($page.url.pathname === '/logout');
  let spacesResolved = $state(false);
  let spacesLoadError = $state<string | null>(null);
  let activeSpaceId = $derived(spacesStore.selectedSpaceId ?? (spacesResolved ? ALL_SPACES_STORAGE_VALUE : undefined));

  function hasExplicitAllSpacesSelection(): boolean {
    try {
      const params = new URL(window.location.href).searchParams;
      if (params.has(SPACE_QUERY_PARAM) && !String(params.get(SPACE_QUERY_PARAM) ?? '').trim()) return true;
      return localStorage.getItem(SELECTED_SPACE_STORAGE_KEY) === ALL_SPACES_STORAGE_VALUE;
    } catch {
      return false;
    }
  }

  function ensureSelectedSpace(spaces: Space[], preserveAllSpaces: boolean) {
    if (spacesStore.isAllSelected && preserveAllSpaces) {
      spacesStore.selectAll();
      return;
    }
    if (spaces.length === 0) return;
    if (spacesStore.selectedSpaceId && spaces.some((space) => space.id === spacesStore.selectedSpaceId)) {
      spacesStore.selectSpace(spacesStore.selectedSpaceId);
      return;
    }
    spacesStore.selectSpace(spaces[0].id);
  }

  async function loadSpacesForShell() {
    spacesResolved = false;
    spacesLoadError = null;
    try {
      const preserveAllSpaces = hasExplicitAllSpacesSelection();
      ensureSelectedSpace(await spacesStore.load(), preserveAllSpaces);
      spacesResolved = true;
    } catch (error) {
      console.error(error);
      if (selectedSpaceFromEnvironment() !== undefined) {
        spacesResolved = true;
        return;
      }
      spacesLoadError = 'Unable to load workspaces.';
    }
  }

  function handleSpaceChange(spaceId: string) {
    if (spaceId === ALL_SPACES_STORAGE_VALUE) {
      spacesStore.selectAll();
      return;
    }
    spacesStore.selectSpace(spaceId);
  }

  async function handleCreateSpace() {
    await goto('/spaces/new');
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
  }

  function handleCommandPaletteShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || isEditableTarget(event.target)) return;
    if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;

    event.preventDefault();
    commandPaletteOpen = !commandPaletteOpen;
  }

  let shellMounted = $state(false);
  let needsYouSpaceKey = $derived(spacesStore.selectedSpaceId ?? 'all');

  $effect(() => {
    needsYouSpaceKey;
    if (!shellMounted || isLogoutRoute) return;
    const spaceId = spacesStore.selectedSpaceId;
    // untrack: startPolling reads/writes its own store state; tracking it
    // here would re-trigger this effect in a loop.
    untrack(() => needsYouStore.startPolling({ spaceId }));
  });

  onMount(() => {
    void redirectToPreferredOrigin(window.location);
    void loadSpacesForShell();
    shellMounted = true;
    return () => {
      shellMounted = false;
      needsYouStore.stop();
    };
  });
</script>

<svelte:window onkeydown={handleCommandPaletteShortcut} />

<div class="shadcn-app">
  {#if isLogoutRoute}
    <main class="auth-blank" aria-label="Signing out">
      {@render children()}
    </main>
  {:else}
    <Sidebar.Provider class="app-shell">
      <AppSidebar
        {activeSpaceId}
        selectedSpaceName={spacesStore.selectedSpace?.name ?? undefined}
        onSpaceChange={handleSpaceChange}
        onCreateSpace={handleCreateSpace}
      >
        {#snippet inboxBadge()}
          {#if needsYouStore.showBadge}
            <span
              class="font-mono text-xs tabular-nums"
              data-testid="inbox-pending-badge"
              aria-label={`${needsYouStore.displayCount} pending inbox items`}
            >
              {needsYouStore.displayCount}
            </span>
          {/if}
        {/snippet}
      </AppSidebar>
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
            <div class="header-actions">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                class="command-palette-header-toggle"
                onclick={() => (commandPaletteOpen = true)}
                aria-label="Open command palette"
                title="Open command palette"
              >
                <SearchIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                class="agent-chat-header-toggle"
                onclick={() => (agentChatOpen = !agentChatOpen)}
                aria-label={agentChatOpen ? 'Collapse agent chat' : 'Open agent chat'}
                aria-pressed={agentChatOpen}
                title={agentChatOpen ? 'Collapse agent chat' : 'Open agent chat'}
              >
                {#if agentChatOpen}
                  <PanelRightCloseIcon />
                {:else}
                  <PanelRightOpenIcon />
                {/if}
              </Button>
            </div>
          </div>
        </header>
        <main class="real-content">
          {#if spacesLoadError}
            <div class="space-loading" role="alert">
              <span>{spacesLoadError}</span>
              <button type="button" onclick={() => void loadSpacesForShell()}>Retry</button>
            </div>
          {:else if spacesResolved}
            {#key activeSpaceId ?? 'all'}
              {@render children()}
            {/key}
          {:else}
            <div class="space-loading" role="status" aria-live="polite">Loading workspace...</div>
          {/if}
        </main>
      </Sidebar.Inset>
    </Sidebar.Provider>
    <CommandPalette bind:open={commandPaletteOpen} onCreateSpace={handleCreateSpace} />
    <GlobalAgentChatDrawer bind:open={agentChatOpen} />
  {/if}
</div>

<style>
  .shadcn-app {
    height: 100dvh;
    overflow: hidden;
    padding: 0 var(--agent-chat-layout-offset, 0px) 0 0;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font-family: var(--shadcn-font-sans);
    transition: padding-right 220ms cubic-bezier(0.2, 0, 0, 1);
  }

  :global(html.agent-chat-open) .shadcn-app {
    --agent-chat-layout-offset: var(--agent-chat-rail-width);
  }

  .auth-blank {
    min-height: 100dvh;
    background: var(--shadcn-background);
  }

  .real-content {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    padding: 1.5rem;
    background: var(--shadcn-background);
  }

  .space-loading {
    display: grid;
    gap: 0.75rem;
    min-height: 12rem;
    place-items: center;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  .space-loading button {
    height: 32px;
    border: 1px solid var(--shadcn-border);
    border-radius: 6px;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    padding: 0 0.75rem;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 650;
    cursor: pointer;
  }

  .space-loading button:hover {
    background: var(--shadcn-accent);
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

  .header-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
    margin-left: auto;
  }

  :global(.agent-chat-header-toggle svg) {
    stroke-width: 1.85;
  }

  :global(.command-palette-header-toggle svg) {
    stroke-width: 1.85;
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

  @media (max-width: 900px) {
    :global(html.agent-chat-open) .shadcn-app {
      --agent-chat-layout-offset: 0px;
    }

    .shadcn-app {
      padding-right: 0;
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
