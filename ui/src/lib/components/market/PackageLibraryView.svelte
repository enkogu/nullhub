<script lang="ts">
  import DownloadIcon from "@lucide/svelte/icons/download";
  import PackageIcon from "@lucide/svelte/icons/package";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import type { PackageManifest, SpaceSelection } from "$lib/api/client";
  import { packageLibraryDownloadHref } from "$lib/api/packages";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { packageBlastRadius, packageContributesSummary, packageRequirementSummary } from "./market";

  let {
    title = "Installed",
    description = "Packages available in the selected Space library.",
    packages = [],
    state: viewState = "populated",
    error,
    emptyTitle = "No packages in this Space",
    emptyDescription = "The selected Space package library is reachable, but it has no package manifests yet.",
    actionLabel = "Refresh",
    spaceId,
    exportedOnly = false,
    onRetry,
  }: {
    title?: string;
    description?: string;
    packages?: PackageManifest[];
    state?: DataStateKind;
    error?: unknown;
    emptyTitle?: string;
    emptyDescription?: string;
    actionLabel?: string;
    spaceId?: SpaceSelection;
    exportedOnly?: boolean;
    onRetry?: () => void;
  } = $props();

  let visiblePackages = $derived(exportedOnly ? packages.filter((pkg) => packageLooksExported(pkg)) : packages);
  let resolvedState = $derived(
    viewState === "populated" && visiblePackages.length === 0 ? "empty" : viewState,
  );

  function packageLooksExported(pkg: PackageManifest): boolean {
    return pkg.id.startsWith("export.") || Boolean((pkg.config as Record<string, unknown>).export);
  }

  function downloadHref(pkg: PackageManifest): string {
    return packageLibraryDownloadHref(pkg.id, spaceId);
  }
</script>

<section class="flex min-w-0 flex-col gap-4" data-slot="package-library">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-foreground text-lg font-semibold">{title}</h2>
      <p class="text-muted-foreground mt-1 text-sm leading-5">{description}</p>
    </div>
    <Button variant="outline" size="sm" onclick={onRetry}>
      <RefreshCwIcon class="size-4" aria-hidden="true" />
      {actionLabel}
    </Button>
  </div>

  <DataState
    state={resolvedState}
    {error}
    loadingTitle="Loading packages"
    loadingDescription="Reading the selected Space package library."
    {emptyTitle}
    {emptyDescription}
    errorTitle="Package library unavailable"
    retryLabel="Retry"
    onRetry={onRetry}
  >
    <div class="grid gap-4 xl:grid-cols-3 lg:grid-cols-2">
      {#each visiblePackages as pkg (pkg.id)}
        {@const href = downloadHref(pkg)}
        <Card class="gap-4 px-5" data-slot="library-package-card">
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{pkg.scale}</Badge>
                <Badge variant="secondary">{pkg.itemTypeLabel}</Badge>
                {#if packageLooksExported(pkg)}
                  <Badge variant="success">My package</Badge>
                {:else}
                  <Badge variant="muted">Installed</Badge>
                {/if}
              </div>
              <div class="min-w-0 space-y-1">
                <h3 class="text-foreground text-base font-semibold leading-6">{pkg.name}</h3>
                <p class="text-muted-foreground text-sm leading-5">{pkg.summary}</p>
              </div>
            </div>
            <PackageIcon class="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
          </div>

          <dl class="grid gap-3 text-sm">
            <div>
              <dt class="text-muted-foreground">Package id</dt>
              <dd class="text-foreground break-all font-medium">{pkg.id}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Contributes</dt>
              <dd class="text-foreground leading-5">{packageContributesSummary(pkg)}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Requirements</dt>
              <dd class="text-foreground leading-5">{packageRequirementSummary(pkg)}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Library evidence</dt>
              <dd class="text-foreground leading-5">{packageBlastRadius(pkg)}</dd>
            </div>
          </dl>

          <div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span class="text-muted-foreground text-xs">Manifest v{pkg.version || "1.0.0"}</span>
            <Button href={href || undefined} disabled={!href} target="_blank" rel="noreferrer" size="sm" variant="outline">
              <DownloadIcon class="size-4" aria-hidden="true" />
              Download JSON
            </Button>
          </div>
        </Card>
      {/each}
    </div>
  </DataState>
</section>
