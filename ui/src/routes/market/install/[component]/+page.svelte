<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import AddExistingDialog from "$lib/components/AddExistingDialog.svelte";
  import InstallWizard from "$lib/components/market/InstallWizard.svelte";
  import { api, packagesApi, spacesApi, type PackageManifest, type Space, type StandaloneInfo } from "$lib/api/client";
  import { normalizePackageManifest } from "$lib/api/packages";
  import { selectedSpaceFromEnvironment } from "$lib/api/spaces";
  import { instanceRoute } from "$lib/nullstack/path";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import type { DataStateKind } from "$lib/components/DataState.svelte";
  import { agentOptionsFromStatus, type InstallAgentOption, type InstallPayload } from "$lib/components/market/installWizard";

  const componentNames: Record<string, string> = {
    nullclaw: "NullClaw",
    nullboiler: "NullBoiler",
    nulltickets: "NullTickets",
    nullwatch: "NullWatch",
  };

  let packageKey = $derived($page.params.component || "");
  let pkg = $state<PackageManifest | null>(null);
  let installed = $state(false);
  let spaces = $state<Space[]>([]);
  let selectedSpaceId = $state<string | null | undefined>(undefined);
  let loading = $state(true);
  let error = $state<unknown>(null);
  let agents = $state<InstallAgentOption[]>([]);
  let agentsLoading = $state(false);
  let agentsError = $state<unknown>(null);
  let standalone = $state<StandaloneInfo | null>(null);
  let standaloneRequestSeq = 0;
  let dialogOpen = $state(false);
  let dialogError = $state("");
  let dialogImporting = $state(false);
  let stagedPayload = $state<InstallPayload | null>(null);
  let routeState = $derived<DataStateKind>(
    error ? "error" : loading ? "loading" : pkg ? "populated" : "empty",
  );
  let agentsState = $derived<DataStateKind>(
    agentsError ? "error" : agentsLoading && agents.length === 0 ? "loading" : agents.length === 0 ? "empty" : "populated",
  );
  let componentName = $derived(componentNameForPackage(pkg, packageKey));
  let displayName = $derived(componentName ? componentNames[componentName] || componentName : "");
  let existingButtonLabel = $derived(
    standalone?.already_imported ? "Add Another Existing" : "Add Existing",
  );

  onMount(() => {
    void loadInstallPage();
  });

  async function loadInstallPage() {
    loading = true;
    error = null;
    stagedPayload = null;
    selectedSpaceId = selectedSpaceFromEnvironment();
    try {
      const [catalog, spaceList] = await Promise.all([
        packagesApi.listCatalogPackages(),
        spacesApi.listSpaces().catch(() => [] as Space[]),
      ]);
      spaces = withSelectedSpaceFallback(spaceList, selectedSpaceId);
      pkg = resolvePackage(catalog.packages, packageKey);
      if (pkg && selectedSpaceId) {
        try {
          const installedList = await packagesApi.listInstalledPackages({ spaceId: selectedSpaceId });
          installed = installedList.packages.some((candidate) => candidate.id === pkg?.id);
        } catch {
          installed = false;
        }
      } else {
        installed = false;
      }
      await refreshAgents();
      if (componentNameForPackage(pkg, packageKey)) {
        await refreshStandalone(componentNameForPackage(pkg, packageKey));
      }
    } catch (err) {
      error = err;
      pkg = null;
      installed = false;
    } finally {
      loading = false;
    }
  }

  async function refreshAgents() {
    agentsLoading = true;
    agentsError = null;
    try {
      agents = agentOptionsFromStatus(await api.getStatus());
    } catch (err) {
      agents = [];
      agentsError = err;
    } finally {
      agentsLoading = false;
    }
  }

  function withSelectedSpaceFallback(spaceList: Space[], selected: string | null | undefined): Space[] {
    if (!selected || spaceList.some((space) => space.id === selected)) return spaceList;
    return [{ id: selected, name: selected, kind: "workspace", stage: "active" }, ...spaceList];
  }

  function resolvePackage(packages: PackageManifest[], key: string): PackageManifest | null {
    const direct = packages.find((candidate) => candidate.id === key);
    if (direct) return direct;
    const byComponent = packages.find((candidate) => componentNameForPackage(candidate, key) === key);
    if (byComponent) return byComponent;
    return fallbackComponentPackage(key);
  }

  function componentNameForPackage(source: PackageManifest | null, fallback = ""): string {
    const configured = typeof source?.config?.component === "string" ? source.config.component : "";
    const target = configured || (source?.scale === "component" ? source.installTarget.split(".")[0] : "");
    if (target && componentNames[target]) return target;
    return componentNames[fallback] ? fallback : "";
  }

  function fallbackComponentPackage(component: string): PackageManifest | null {
    const display = componentNames[component];
    if (!display) return null;
    return normalizePackageManifest({
      id: `builtin.${component}-component`,
      name: `${display} Component`,
      version: "local",
      scale: "component",
      summary: `Base managed ${display} component for the selected Space.`,
      requires: component === "nullclaw"
        ? [{ kind: "secret_ref", name: "model_provider", secret_ref: "providers.default.api_key" }]
        : [],
      contributes: [{ kind: "team_capability", name: `${component}-runtime` }],
      config: { component, install_target: `${component}.default` },
      seeds: [],
      extends: [],
      charter: {
        mission: `Run one managed ${display} component.`,
        autonomy_bounds: ["Use configured Space settings and secret refs only"],
        metrics: ["runtime_health"],
      },
    });
  }

  async function refreshStandalone(component: string): Promise<StandaloneInfo | null> {
    const requestSeq = ++standaloneRequestSeq;
    if (!component) {
      standalone = null;
      return null;
    }
    try {
      const data = await api.getStandalone(component);
      if (requestSeq === standaloneRequestSeq && component === componentName) standalone = data;
      return data;
    } catch {
      if (requestSeq === standaloneRequestSeq && component === componentName) standalone = { standalone: false };
      return null;
    }
  }

  async function openExistingDialog() {
    if (!componentName) return;
    dialogError = "";
    if (!standalone) await refreshStandalone(componentName);
    dialogOpen = true;
  }

  function closeDialog() {
    if (dialogImporting) return;
    dialogOpen = false;
    dialogError = "";
  }

  async function handleExistingSubmit(payload: { path?: string; name?: string }) {
    if (!componentName) return;
    dialogImporting = true;
    dialogError = "";
    try {
      const result = await api.importInstance(componentName, payload);
      dialogOpen = false;
      await goto(instanceRoute(componentName, result?.instance || payload.name || "default"));
    } catch (err) {
      dialogError = (err as Error).message;
    } finally {
      dialogImporting = false;
    }
  }

  function stageInstall(payload: InstallPayload) {
    stagedPayload = payload;
  }
</script>

<div class="install-page">
  {#if componentName && displayName}
    <Card class="flex-row items-center justify-between gap-4 px-5">
      <div class="min-w-0">
        <div class="text-sm font-medium text-foreground">Already have {displayName}</div>
        <div class="existing-detail mt-1 text-sm text-muted-foreground">
          {#if standalone?.standalone && standalone.standalone_path}
            {#if standalone.already_imported}
              Default install is already added.
            {:else}
              Default install detected at <code>{standalone.standalone_path}</code>
            {/if}
          {:else}
            Add a local {displayName} home.
          {/if}
        </div>
      </div>
      <Button
        variant="outline"
        class="shrink-0"
        onclick={openExistingDialog}
        disabled={dialogImporting}
      >
        {existingButtonLabel}
      </Button>
    </Card>
  {/if}

  <InstallWizard
    {pkg}
    {installed}
    state={routeState}
    {error}
    {spaces}
    {selectedSpaceId}
    {agents}
    {agentsState}
    {agentsError}
    onRetry={() => void loadInstallPage()}
    onRefreshAgents={() => void refreshAgents()}
    onEnact={stageInstall}
  />

  {#if stagedPayload}
    <p class="sr-only" aria-live="polite">Install plan staged for {stagedPayload.spaceId}.</p>
  {/if}
</div>

<AddExistingDialog
  open={dialogOpen}
  component={componentName}
  {displayName}
  {standalone}
  importing={dialogImporting}
  error={dialogError}
  onClose={closeDialog}
  onSubmit={handleExistingSubmit}
/>

<style>
  .install-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 1120px;
  }

  .existing-detail {
    overflow-wrap: anywhere;
  }

  .existing-detail code {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8125em;
    color: var(--shadcn-foreground);
  }

  @media (max-width: 640px) {
    .install-page :global([data-slot="card"]:first-child) {
      flex-direction: column;
      align-items: stretch;
    }

    .install-page :global([data-slot="card"]:first-child [data-slot="button"]) {
      width: 100%;
    }
  }
</style>
