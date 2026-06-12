<script lang="ts">
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import BoxIcon from "@lucide/svelte/icons/box";
  import KeyRoundIcon from "@lucide/svelte/icons/key-round";
  import LayersIcon from "@lucide/svelte/icons/layers";
  import type { PackageManifest } from "$lib/api/packages";
  import { packageDetailHref } from "$lib/api/packages";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { packageBlastRadius, packageContributesSummary } from "./market";

  let {
    pkg,
    installed = false,
  }: {
    pkg: PackageManifest;
    installed?: boolean;
  } = $props();

  let secretRequirements = $derived(pkg.requires.filter((item) => item.kind === "secret_ref"));
  let dependencyRequirements = $derived(pkg.requires.filter((item) => item.kind !== "secret_ref"));
  let detailHref = $derived(packageDetailHref(pkg.id));
</script>

<Card class="h-full gap-4 px-5" data-slot="package-card">
  <div class="flex min-w-0 items-start justify-between gap-3">
    <div class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{pkg.scale}</Badge>
        <Badge variant={pkg.stage === "blueprint" ? "default" : "secondary"}>{pkg.stageLabel}</Badge>
        {#if installed}
          <Badge variant="success">Installed</Badge>
        {/if}
      </div>
      <div class="min-w-0 space-y-1">
        <h2 class="text-foreground text-base font-semibold leading-6">{pkg.name}</h2>
        <p class="text-muted-foreground text-sm leading-5">{pkg.summary}</p>
      </div>
    </div>
    <Badge variant="muted" class="shrink-0">{pkg.itemTypeLabel}</Badge>
  </div>

  <div class="grid gap-3 text-sm">
    <div class="flex gap-2">
      <LayersIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div class="min-w-0">
        <p class="text-foreground font-medium">Contributes</p>
        <p class="text-muted-foreground leading-5">{packageContributesSummary(pkg)}</p>
      </div>
    </div>
    <div class="flex gap-2">
      <BoxIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div class="min-w-0">
        <p class="text-foreground font-medium">Blast radius</p>
        <p class="text-muted-foreground leading-5">{packageBlastRadius(pkg)}</p>
      </div>
    </div>
  </div>

  <div class="flex flex-wrap gap-2" aria-label={`${pkg.name} requirements`}>
    {#if pkg.requires.length === 0}
      <Badge variant="outline">No prerequisites</Badge>
    {:else}
      {#each secretRequirements as requirement (requirement.name + requirement.secretRef)}
        <Badge variant="warning">
          <KeyRoundIcon class="size-3" aria-hidden="true" />
          {requirement.secretRef || requirement.name}
        </Badge>
      {/each}
      {#each dependencyRequirements as requirement (requirement.kind + requirement.name + requirement.id)}
        <Badge variant="outline">{requirement.label}: {requirement.name || requirement.id}</Badge>
      {/each}
    {/if}
  </div>

  <div class="mt-auto flex items-center justify-between gap-3 border-t pt-4">
    <p class="text-muted-foreground text-xs">Install review shows required secrets before execution.</p>
    <Button href={detailHref} size="sm" aria-label={`Review package ${pkg.name}`}>
      Review
      <ArrowRightIcon class="size-4" aria-hidden="true" />
    </Button>
  </div>
</Card>
