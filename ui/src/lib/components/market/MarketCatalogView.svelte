<script lang="ts">
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import type { PackageManifest } from "$lib/api/packages";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { PageHeader } from "$lib/components/ui/page-header";
  import MarketFilterBar from "./MarketFilterBar.svelte";
  import PackageCard from "./PackageCard.svelte";
  import {
    defaultMarketFilters,
    filterMarketPackages,
    stageRecommendation,
    type MarketFilters,
  } from "./market";

  let {
    packages = [],
    installedPackageIds = new Set<string>(),
    state: viewState = "populated",
    error,
    onRetry,
  }: {
    packages?: PackageManifest[];
    installedPackageIds?: Set<string>;
    state?: DataStateKind;
    error?: unknown;
    onRetry?: () => void;
  } = $props();

  let filters = $state<MarketFilters>(defaultMarketFilters());
  let filteredPackages = $derived(filterMarketPackages(packages, filters));
  let recommendationStages = $derived(["foundation", "capability", "starter", "blueprint"] as const);
  let packageCountByStage = $derived(
    recommendationStages.map((stage) => ({
      stage,
      label: stage[0].toUpperCase() + stage.slice(1),
      count: packages.filter((pkg) => pkg.stage === stage).length,
      text: stageRecommendation(stage),
    })),
  );

  function handleFilterChange(next: MarketFilters) {
    filters = next;
  }

  function resetFilters() {
    filters = defaultMarketFilters();
  }
</script>

<section class="flex min-w-0 flex-col gap-5" data-slot="market-catalog">
  <PageHeader
    title="Market"
    subtitle="Local built-in packages for Loops, Workflows, Skills, MCP servers, Agent profiles, Blueprints, and Order templates."
    align="start"
  >
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={onRetry}>Refresh</Button>
    {/snippet}
  </PageHeader>

  <div class="grid gap-3 lg:grid-cols-4" aria-label="Market recommendation stages">
    {#each packageCountByStage as item (item.stage)}
      <Card class="gap-3 px-4 py-4">
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <SparklesIcon class="text-primary size-4 shrink-0" aria-hidden="true" />
            <h2 class="text-sm font-semibold">{item.label}</h2>
          </div>
          <Badge variant={item.count ? "secondary" : "outline"}>{item.count}</Badge>
        </div>
        <p class="text-muted-foreground text-sm leading-5">{item.text}</p>
      </Card>
    {/each}
  </div>

  <MarketFilterBar
    filters={filters}
    resultCount={filteredPackages.length}
    state={viewState === "populated" ? "populated" : viewState}
    onChange={handleFilterChange}
    onReset={resetFilters}
  />

  <DataState
    state={viewState}
    {error}
    loadingTitle="Loading Market"
    loadingDescription="Reading the local built-in package catalog."
    emptyTitle="No packages in the built-in catalog"
    emptyDescription="The backend catalog is reachable, but it did not return any package manifests."
    errorTitle="Market unavailable"
    retryLabel="Retry"
    onRetry={onRetry}
  >
    {#if filteredPackages.length === 0}
      <DataState
        state="empty"
        emptyTitle="No packages match these filters"
        emptyDescription="Clear the filters or search for a different package type."
        emptyActionLabel="Clear filters"
        onRetry={resetFilters}
      />
    {:else}
      <div class="grid gap-4 xl:grid-cols-3 lg:grid-cols-2">
        {#each filteredPackages as pkg (pkg.id)}
          <PackageCard {pkg} installed={installedPackageIds.has(pkg.id)} />
        {/each}
      </div>
    {/if}
  </DataState>
</section>
