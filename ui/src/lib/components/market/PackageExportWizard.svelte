<script lang="ts">
  import DownloadIcon from "@lucide/svelte/icons/download";
  import PackageCheckIcon from "@lucide/svelte/icons/package-check";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import WizardShell, { type WizardShellStep } from "$lib/components/WizardShell.svelte";
  import type {
    PackageExportRequest,
    PackageExportResult,
    PackageExportScale,
    PackageExportScope,
    PackageManifest,
  } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";

  let {
    installedPackages = [],
    exporting = false,
    exportError = null,
    exportResult = null,
    onExport,
  }: {
    installedPackages?: PackageManifest[];
    exporting?: boolean;
    exportError?: unknown;
    exportResult?: PackageExportResult | null;
    onExport?: (request: PackageExportRequest) => void | Promise<void>;
  } = $props();

  let activeStepId = $state("scope");
  let scope = $state<PackageExportScope>("space");
  let packageId = $state("");
  let name = $state("");
  let version = $state("1.0.0");
  let summary = $state("");
  let selectedPackageIds = $state<string[]>([]);
  let singlePackageId = $state("");

  let hasInstalledPackages = $derived(installedPackages.length > 0);
  let selectedPackages = $derived(installedPackages.filter((pkg) => selectedPackageIds.includes(pkg.id)));
  let singlePackage = $derived(installedPackages.find((pkg) => pkg.id === singlePackageId) ?? null);
  let requestScale = $derived(scaleForScope(scope));
  let exportErrorMessage = $derived(errorMessage(exportError));

  const steps: WizardShellStep[] = $derived([
    {
      id: "scope",
      title: "Scope",
      description: "Choose what this package will contain.",
      completed: scope === "space" || (scope === "selection" && selectedPackageIds.length > 0) || (scope === "single" && Boolean(singlePackageId)),
      error: scope !== "space" && !hasInstalledPackages ? "The selected Space library is empty." : "",
    },
    {
      id: "details",
      title: "Details",
      description: "Name the exported manifest.",
      completed: Boolean(version.trim()) && packageIdIsSafe(packageId),
      error: packageId.trim() && !packageIdIsSafe(packageId) ? "Use letters, numbers, dots, underscores, or hyphens." : "",
    },
    {
      id: "review",
      title: "Review",
      description: "Export to the selected Space library.",
      completed: Boolean(exportResult),
    },
  ]);

  $effect(() => {
    if (!singlePackageId && installedPackages[0]) {
      singlePackageId = installedPackages[0].id;
    }
  });

  function packageIdIsSafe(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.length === 0 || /^[A-Za-z0-9._-]{1,128}$/.test(trimmed);
  }

  function errorMessage(error: unknown): string {
    if (!error) return "";
    return error instanceof Error ? error.message : String(error);
  }

  function scaleForScope(scope: PackageExportScope): PackageExportScale {
    if (scope === "selection") return "kit";
    if (scope === "single") return "component";
    return "blueprint";
  }

  function togglePackage(packageId: string, checked: boolean) {
    selectedPackageIds = checked
      ? Array.from(new Set([...selectedPackageIds, packageId]))
      : selectedPackageIds.filter((id) => id !== packageId);
  }

  function validateStep(step: WizardShellStep) {
    if (step.id === "scope") {
      if (scope === "selection" && selectedPackageIds.length === 0) return "Select at least one package from the Space library.";
      if (scope === "single" && !singlePackageId) return "Choose one package from the Space library.";
    }
    if (step.id === "details") {
      if (!version.trim()) return "Enter a manifest version.";
      if (!packageIdIsSafe(packageId)) return "Use a safe package id or leave it blank for the backend default.";
    }
    return true;
  }

  function buildRequest(): PackageExportRequest {
    const request: PackageExportRequest = {
      scope,
      scale: requestScale,
    };
    if (packageId.trim()) request.id = packageId.trim();
    if (name.trim()) request.name = name.trim();
    if (version.trim()) request.version = version.trim();
    if (summary.trim()) request.summary = summary.trim();
    if (scope === "selection") request.selection = { packages: selectedPackageIds };
    if (scope === "single") request.single = { kind: "package", id: singlePackageId };
    return request;
  }

  async function exportPackage() {
    if (exporting || !onExport) return;
    await onExport(buildRequest());
  }
</script>

<WizardShell
  title="Pack wizard"
  description="Export Space data or existing package references into a local package manifest."
  steps={steps}
  bind:activeStepId
  validateStep={validateStep}
  onComplete={exportPackage}
  nextLabel="Continue"
  completeLabel={exporting ? "Exporting..." : "Export package"}
>
  {#snippet children(step)}
    {#if step.id === "scope"}
      <div class="grid gap-4">
        <div class="grid gap-3 md:grid-cols-3">
          <label class="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
            <input class="mt-1" type="radio" bind:group={scope} value="space" />
            <span>
              <span class="block font-medium text-foreground">Whole Space</span>
              <span class="mt-1 block leading-5 text-muted-foreground">Exports Space metadata, orders, instances, providers, and channels as a blueprint.</span>
            </span>
          </label>
          <label class="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
            <input class="mt-1" type="radio" bind:group={scope} value="selection" disabled={!hasInstalledPackages} />
            <span>
              <span class="block font-medium text-foreground">Selection</span>
              <span class="mt-1 block leading-5 text-muted-foreground">Exports selected package references as a kit.</span>
            </span>
          </label>
          <label class="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
            <input class="mt-1" type="radio" bind:group={scope} value="single" disabled={!hasInstalledPackages} />
            <span>
              <span class="block font-medium text-foreground">Single package</span>
              <span class="mt-1 block leading-5 text-muted-foreground">Exports one existing package reference as a component package.</span>
            </span>
          </label>
        </div>

        {#if scope === "selection"}
          <div class="rounded-lg border">
            <div class="border-b px-3 py-2">
              <p class="text-sm font-medium">Package references</p>
              <p class="text-muted-foreground text-xs">Select one or more package manifests from this Space library.</p>
            </div>
            <div class="grid max-h-64 gap-0 overflow-auto">
              {#each installedPackages as pkg (pkg.id)}
                <label class="flex cursor-pointer items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50">
                  <input
                    class="mt-1"
                    type="checkbox"
                    checked={selectedPackageIds.includes(pkg.id)}
                    onchange={(event) => togglePackage(pkg.id, event.currentTarget.checked)}
                  />
                  <span class="min-w-0">
                    <span class="block font-medium text-foreground">{pkg.name}</span>
                    <span class="text-muted-foreground block break-all text-xs">{pkg.id}</span>
                  </span>
                </label>
              {/each}
            </div>
          </div>
        {:else if scope === "single"}
          <div class="space-y-1.5">
            <Label for="market-export-single">Package</Label>
            <Select id="market-export-single" bind:value={singlePackageId}>
              {#each installedPackages as pkg (pkg.id)}
                <option value={pkg.id}>{pkg.name}</option>
              {/each}
            </Select>
          </div>
        {/if}
      </div>
    {:else if step.id === "details"}
      <div class="grid gap-4">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="market-export-id">Package id</Label>
            <Input id="market-export-id" bind:value={packageId} placeholder="export.ops.starter-kit" autocomplete="off" />
            <p class="text-muted-foreground text-xs">Leave blank to let the backend assign an id.</p>
          </div>
          <div class="space-y-1.5">
            <Label for="market-export-version">Version</Label>
            <Input id="market-export-version" bind:value={version} placeholder="1.0.0" autocomplete="off" />
          </div>
        </div>
        <div class="space-y-1.5">
          <Label for="market-export-name">Name</Label>
          <Input id="market-export-name" bind:value={name} placeholder="Operations Starter Kit" autocomplete="off" />
        </div>
        <div class="space-y-1.5">
          <Label for="market-export-summary">Summary</Label>
          <Textarea id="market-export-summary" bind:value={summary} rows={4} placeholder="Reusable package exported from the selected Space." />
        </div>
      </div>
    {:else}
      <div class="space-y-4">
        <Card class="gap-4 px-4 py-4">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{requestScale}</Badge>
            <Badge variant="secondary">{scope}</Badge>
            <Badge variant={scope === "space" || selectedPackages.length || singlePackage ? "success" : "warning"}>
              {scope === "space" ? "Space export" : scope === "selection" ? `${selectedPackages.length} selected` : singlePackage?.name || "No package"}
            </Badge>
          </div>
          <dl class="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt class="text-muted-foreground">Package id</dt>
              <dd class="text-foreground break-all font-medium">{packageId.trim() || "Backend default"}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Name</dt>
              <dd class="text-foreground font-medium">{name.trim() || "Backend default"}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Version</dt>
              <dd class="text-foreground font-medium">{version.trim() || "1.0.0"}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Install execution</dt>
              <dd class="text-foreground font-medium">Not run by this wizard</dd>
            </div>
          </dl>
        </Card>

        {#if exportErrorMessage}
          <p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {exportErrorMessage}
          </p>
        {/if}

        {#if exportResult}
          <Card class="gap-4 border-emerald-200 bg-emerald-50/70 px-4 py-4" data-slot="package-export-evidence">
            <div class="flex items-start gap-3">
              <PackageCheckIcon class="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
              <div class="min-w-0">
                <h3 class="text-foreground text-base font-semibold">Export created</h3>
                <p class="text-muted-foreground text-sm leading-5">The backend wrote this manifest into the selected Space library.</p>
              </div>
            </div>
            <dl class="grid gap-3 text-sm">
              <div>
                <dt class="text-muted-foreground">Package id</dt>
                <dd class="text-foreground break-all font-medium">{exportResult.packageId}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Manifest file</dt>
                <dd class="text-foreground break-all font-medium">{exportResult.file}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Download URL</dt>
                <dd class="text-foreground break-all font-medium">{exportResult.downloadUrl}</dd>
              </div>
            </dl>
            <div class="flex flex-wrap gap-2">
              <Button href={exportResult.downloadUrl} target="_blank" rel="noreferrer" size="sm" variant="outline">
                <DownloadIcon class="size-4" aria-hidden="true" />
                Download JSON
              </Button>
            </div>
          </Card>
        {:else}
          <div class="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-3 text-sm">
            <UploadIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p class="text-muted-foreground leading-5">Export writes a package manifest only. It does not install or claim that install execution succeeded.</p>
          </div>
        {/if}
      </div>
    {/if}
  {/snippet}
</WizardShell>
