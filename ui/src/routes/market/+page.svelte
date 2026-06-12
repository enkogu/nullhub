<script lang="ts">
  import { onMount } from "svelte";
  import { packagesApi, type PackageExportRequest, type PackageExportResult, type PackageManifest, type SpaceSelection } from "$lib/api/client";
  import { selectedSpaceFromEnvironment } from "$lib/api/spaces";
  import MarketCatalogView from "$lib/components/market/MarketCatalogView.svelte";
  import MarketSpacePanel from "$lib/components/market/MarketSpacePanel.svelte";
  import type { DataStateKind } from "$lib/components/DataState.svelte";

  let packages = $state<PackageManifest[]>([]);
  let installedPackages = $state<PackageManifest[]>([]);
  let loading = $state(true);
  let installedLoading = $state(true);
  let error = $state<unknown>(null);
  let installedError = $state<unknown>(null);
  let exportResult = $state<PackageExportResult | null>(null);
  let exportError = $state<unknown>(null);
  let exporting = $state(false);
  let selectedSpaceId = $state<SpaceSelection | undefined>(undefined);

  let installedPackageIds = $derived(new Set(installedPackages.map((pkg) => pkg.id)));
  let routeState = $derived<DataStateKind>(
    error ? "error" : loading ? "loading" : packages.length === 0 ? "empty" : "populated",
  );
  let installedState = $derived<DataStateKind>(
    installedError ? "error" : installedLoading ? "loading" : installedPackages.length === 0 ? "empty" : "populated",
  );

  function refreshSelectedSpace() {
    selectedSpaceId = selectedSpaceFromEnvironment();
    return selectedSpaceId;
  }

  async function loadInstalledPackages() {
    installedLoading = true;
    installedError = null;
    const spaceId = refreshSelectedSpace();
    try {
      const installed = await packagesApi.listInstalledPackages({ spaceId });
      installedPackages = installed.packages;
    } catch (err) {
      installedError = err;
      installedPackages = [];
    } finally {
      installedLoading = false;
    }
  }

  async function loadMarket() {
    loading = true;
    error = null;
    const catalogPromise = packagesApi.listCatalogPackages();
    const installedPromise = loadInstalledPackages();
    try {
      const catalog = await catalogPromise;
      packages = catalog.packages;
    } catch (err) {
      error = err;
      packages = [];
    } finally {
      loading = false;
    }
    await installedPromise;
  }

  async function exportPackage(request: PackageExportRequest) {
    exporting = true;
    exportError = null;
    exportResult = null;
    const spaceId = refreshSelectedSpace();
    try {
      exportResult = await packagesApi.exportPackage(request, { spaceId });
      await loadInstalledPackages();
    } catch (err) {
      exportError = err;
    } finally {
      exporting = false;
    }
  }

  onMount(() => {
    void loadMarket();
  });
</script>

<div class="flex min-w-0 flex-col gap-8">
  <MarketCatalogView {packages} {installedPackageIds} state={routeState} {error} onRetry={() => void loadMarket()} />
  <MarketSpacePanel
    installedPackages={installedPackages}
    installedState={installedState}
    installedError={installedError}
    {exportResult}
    {exportError}
    {exporting}
    spaceId={selectedSpaceId}
    onRefresh={() => void loadInstalledPackages()}
    onExport={(request) => void exportPackage(request)}
  />
</div>
