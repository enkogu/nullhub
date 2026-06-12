<script lang="ts">
  import BanIcon from "@lucide/svelte/icons/ban";
  import type { DataStateKind } from "$lib/components/DataState.svelte";
  import type { PackageExportRequest, PackageExportResult, PackageManifest, SpaceSelection } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "$lib/components/ui/tabs";
  import PackageExportWizard from "./PackageExportWizard.svelte";
  import PackageLibraryView from "./PackageLibraryView.svelte";

  let {
    installedPackages = [],
    installedState = "populated",
    installedError,
    exportResult = null,
    exportError = null,
    exporting = false,
    spaceId,
    onRefresh,
    onExport,
  }: {
    installedPackages?: PackageManifest[];
    installedState?: DataStateKind;
    installedError?: unknown;
    exportResult?: PackageExportResult | null;
    exportError?: unknown;
    exporting?: boolean;
    spaceId?: SpaceSelection;
    onRefresh?: () => void;
    onExport?: (request: PackageExportRequest) => void | Promise<void>;
  } = $props();

  let activeTab = $state("installed");
  let myPackageCount = $derived(installedPackages.filter((pkg) => pkg.id.startsWith("export.") || Boolean((pkg.config as Record<string, unknown>).export)).length);
</script>

<section class="flex min-w-0 flex-col gap-4" data-slot="market-space-panel">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-foreground text-xl font-semibold">Space packages</h2>
      <p class="text-muted-foreground mt-1 text-sm leading-5">Read the selected Space library and export reusable package manifests.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Badge variant="secondary">{installedPackages.length} installed</Badge>
      <Badge variant={myPackageCount ? "success" : "outline"}>{myPackageCount} my packages</Badge>
    </div>
  </div>

  <div class="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-3 text-sm">
    <BanIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <p class="text-muted-foreground leading-5">Install execution is intentionally disabled here until the backend install pipeline is available. Export and download actions are enabled.</p>
  </div>

  <Tabs bind:value={activeTab}>
    <TabsList>
      <TabsTrigger value="installed">Installed</TabsTrigger>
      <TabsTrigger value="my-packages">My Packages</TabsTrigger>
      <TabsTrigger value="pack-wizard">Pack wizard</TabsTrigger>
    </TabsList>

    <TabsContent value="installed">
      <PackageLibraryView
        title="Installed"
        description="Package manifests currently present in the selected Space library."
        packages={installedPackages}
        state={installedState}
        error={installedError}
        {spaceId}
        onRetry={onRefresh}
      />
    </TabsContent>

    <TabsContent value="my-packages">
      <PackageLibraryView
        title="My Packages"
        description="Exports created from this Space and available for download from the local library."
        packages={installedPackages}
        state={installedState}
        error={installedError}
        emptyTitle="No exported packages"
        emptyDescription="Use the Pack wizard to create a reusable package manifest from this Space."
        exportedOnly
        {spaceId}
        onRetry={onRefresh}
      />
    </TabsContent>

    <TabsContent value="pack-wizard">
      <PackageExportWizard
        {installedPackages}
        {exporting}
        {exportError}
        {exportResult}
        onExport={onExport}
      />
    </TabsContent>
  </Tabs>
</section>
