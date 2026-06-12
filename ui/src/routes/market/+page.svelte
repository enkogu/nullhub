<script lang="ts">
  import { onMount } from "svelte";
  import { packagesApi, type PackageManifest } from "$lib/api/client";
  import MarketCatalogView from "$lib/components/market/MarketCatalogView.svelte";
  import type { DataStateKind } from "$lib/components/DataState.svelte";

  let packages = $state<PackageManifest[]>([]);
  let installedPackageIds = $state<Set<string>>(new Set());
  let loading = $state(true);
  let error = $state<unknown>(null);

  let routeState = $derived<DataStateKind>(
    error ? "error" : loading ? "loading" : packages.length === 0 ? "empty" : "populated",
  );

  async function loadMarket() {
    loading = true;
    error = null;
    try {
      const catalog = await packagesApi.listCatalogPackages();
      packages = catalog.packages;
      try {
        const installed = await packagesApi.listInstalledPackages();
        installedPackageIds = new Set(installed.packages.map((pkg) => pkg.id));
      } catch {
        installedPackageIds = new Set();
      }
    } catch (err) {
      error = err;
      packages = [];
      installedPackageIds = new Set();
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadMarket();
  });
</script>

<MarketCatalogView {packages} {installedPackageIds} state={routeState} {error} onRetry={() => void loadMarket()} />
