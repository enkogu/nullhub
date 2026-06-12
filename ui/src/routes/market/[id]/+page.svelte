<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { packagesApi, type PackageManifest } from "$lib/api/client";
  import type { DataStateKind } from "$lib/components/DataState.svelte";
  import PackageDetailView from "$lib/components/market/PackageDetailView.svelte";

  let pkg = $state<PackageManifest | null>(null);
  let installed = $state(false);
  let loading = $state(true);
  let error = $state<unknown>(null);
  let packageId = $derived($page.params.id || "");
  let routeState = $derived<DataStateKind>(
    error ? "error" : loading ? "loading" : pkg ? "populated" : "empty",
  );

  async function loadPackage() {
    loading = true;
    error = null;
    try {
      const catalog = await packagesApi.listCatalogPackages();
      pkg = catalog.packages.find((candidate) => candidate.id === packageId) ?? null;
      try {
        const installedList = await packagesApi.listInstalledPackages();
        installed = installedList.packages.some((candidate) => candidate.id === packageId);
      } catch {
        installed = false;
      }
    } catch (err) {
      error = err;
      pkg = null;
      installed = false;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadPackage();
  });
</script>

<PackageDetailView {pkg} {installed} state={routeState} {error} onRetry={() => void loadPackage()} />
