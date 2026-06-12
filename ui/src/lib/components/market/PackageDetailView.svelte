<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import CheckCircle2Icon from "@lucide/svelte/icons/check-circle-2";
  import KeyRoundIcon from "@lucide/svelte/icons/key-round";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import type { PackageManifest } from "$lib/api/packages";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { packageBlastRadius, packageRequirementSummary, stageRecommendation } from "./market";

  let {
    pkg,
    installed = false,
    state: viewState = "populated",
    error,
    onRetry,
  }: {
    pkg?: PackageManifest | null;
    installed?: boolean;
    state?: DataStateKind;
    error?: unknown;
    onRetry?: () => void;
  } = $props();

  let secretRequirements = $derived(pkg?.requires.filter((item) => item.kind === "secret_ref") ?? []);
  let dependencyRequirements = $derived(pkg?.requires.filter((item) => item.kind !== "secret_ref") ?? []);
  let installDisabledReason = $derived(
    !pkg
      ? "Package manifest is not loaded."
      : secretRequirements.length > 0
        ? "The install wizard will require these secret refs before staging."
        : "The install wizard previews every change before staging.",
  );
</script>

<section class="flex min-w-0 flex-col gap-5" data-slot="package-detail">
  <PageHeader
    title={pkg?.name ?? "Package detail"}
    subtitle={pkg?.summary ?? "Review package contents, requirements, and blast radius before install."}
    align="start"
  >
    {#snippet actions()}
      <Button href="/market" variant="outline" size="sm">
        <ArrowLeftIcon class="size-4" aria-hidden="true" />
        Market
      </Button>
    {/snippet}
  </PageHeader>

  <DataState
    state={viewState}
    {error}
    loadingTitle="Loading package"
    loadingDescription="Reading the built-in package manifest."
    emptyTitle="Package not found"
    emptyDescription="The requested package id is not present in the built-in catalog."
    emptyActionLabel="Open Market"
    emptyActionHref="/market"
    errorTitle="Package unavailable"
    retryLabel="Retry"
    onRetry={onRetry}
  >
    {#if pkg}
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="flex min-w-0 flex-col gap-5">
          <Card class="gap-4 px-5">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{pkg.scale}</Badge>
              <Badge variant="secondary">{pkg.itemTypeLabel}</Badge>
              <Badge variant={pkg.stage === "blueprint" ? "default" : "muted"}>{pkg.stageLabel}</Badge>
              {#if installed}
                <Badge variant="success">Installed</Badge>
              {/if}
            </div>
            <div class="space-y-2">
              <h2 class="text-foreground text-lg font-semibold">What this package adds</h2>
              <p class="text-muted-foreground text-sm leading-6">{pkg.charter.mission || pkg.summary}</p>
            </div>
            <div class="grid gap-3 md:grid-cols-3">
              <div class="rounded-lg border p-3">
                <p class="text-muted-foreground text-xs font-medium">Contributions</p>
                <p class="text-foreground text-2xl font-semibold">{pkg.contributes.length}</p>
              </div>
              <div class="rounded-lg border p-3">
                <p class="text-muted-foreground text-xs font-medium">Seeds</p>
                <p class="text-foreground text-2xl font-semibold">{pkg.seeds.length}</p>
              </div>
              <div class="rounded-lg border p-3">
                <p class="text-muted-foreground text-xs font-medium">Dependencies</p>
                <p class="text-foreground text-2xl font-semibold">{pkg.requires.length}</p>
              </div>
            </div>
          </Card>

          <Card class="gap-4 px-5">
            <div class="flex items-start gap-3">
              <ShieldAlertIcon class="text-amber-600 mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div class="min-w-0">
                <h2 class="text-foreground text-lg font-semibold">Install impact</h2>
                <p class="text-muted-foreground text-sm leading-6">{packageBlastRadius(pkg)}</p>
              </div>
            </div>
            <div class="grid gap-3">
              {#each pkg.contributes as contribution (contribution.kind + contribution.name + contribution.id)}
                <div class="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{contribution.name || contribution.target || contribution.id}</p>
                    <p class="text-muted-foreground text-xs">{contribution.label}</p>
                  </div>
                  <Badge variant="outline">{contribution.kind}</Badge>
                </div>
              {/each}
            </div>
          </Card>

          <Card class="gap-4 px-5">
            <h2 class="text-foreground text-lg font-semibold">Seed content</h2>
            {#if pkg.seeds.length === 0}
              <p class="text-muted-foreground text-sm">This package does not declare seed records.</p>
            {:else}
              <div class="grid gap-3">
                {#each pkg.seeds as seed, index (`${seed.kind}-${seed.slug}-${seed.name}-${index}`)}
                  <div class="rounded-lg border p-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge variant="muted">{seed.kind || "seed"}</Badge>
                      <h3 class="text-sm font-semibold">{seed.name || seed.title || seed.slug || `Seed ${index + 1}`}</h3>
                    </div>
                    {#if seed.description || seed.summary || seed.tagline}
                      <p class="text-muted-foreground mt-2 text-sm leading-5">{seed.description || seed.summary || seed.tagline}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </Card>
        </div>

        <aside class="flex min-w-0 flex-col gap-5">
          <Card class="gap-4 px-5">
            <h2 class="text-foreground text-lg font-semibold">Facts</h2>
            <dl class="grid gap-3 text-sm">
              <div>
                <dt class="text-muted-foreground">Package id</dt>
                <dd class="text-foreground break-all font-medium">{pkg.id}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Version</dt>
                <dd class="text-foreground font-medium">{pkg.version}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Install target</dt>
                <dd class="text-foreground font-medium">{pkg.installTarget || "Not declared"}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Recommendation</dt>
                <dd class="text-foreground leading-5">{stageRecommendation(pkg.stage)}</dd>
              </div>
            </dl>
          </Card>

          <Card class="gap-4 px-5">
            <div class="flex items-start gap-3">
              <KeyRoundIcon class="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div class="min-w-0">
                <h2 class="text-foreground text-lg font-semibold">Requirements</h2>
                <p class="text-muted-foreground text-sm leading-5">{packageRequirementSummary(pkg)}</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              {#if pkg.requires.length === 0}
                <Badge variant="outline">No prerequisites</Badge>
              {:else}
                {#each secretRequirements as requirement (requirement.name + requirement.secretRef)}
                  <Badge variant="warning">{requirement.secretRef || requirement.name}</Badge>
                {/each}
                {#each dependencyRequirements as requirement (requirement.kind + requirement.name + requirement.id)}
                  <Badge variant="outline">{requirement.label}: {requirement.name || requirement.id}</Badge>
                {/each}
              {/if}
            </div>
          </Card>

          <Card class="gap-4 px-5">
            <div class="flex items-start gap-3">
              <CheckCircle2Icon class="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div class="min-w-0">
                <h2 class="text-foreground text-lg font-semibold">Install review</h2>
                <p class="text-muted-foreground text-sm leading-5">{installDisabledReason}</p>
              </div>
            </div>
            {#if pkg}
              <Button href={`/market/install/${encodeURIComponent(pkg.id)}`}>Install into Space</Button>
            {:else}
              <Button disabled>Install into Space</Button>
            {/if}
          </Card>

          {#if pkg.charter.autonomyBounds.length || pkg.charter.metrics.length}
            <Card class="gap-4 px-5">
              <h2 class="text-foreground text-lg font-semibold">Charter</h2>
              {#if pkg.charter.autonomyBounds.length}
                <div>
                  <h3 class="text-sm font-medium">Autonomy bounds</h3>
                  <ul class="text-muted-foreground mt-2 grid gap-1 text-sm leading-5">
                    {#each pkg.charter.autonomyBounds as bound (bound)}
                      <li>{bound}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if pkg.charter.metrics.length}
                <div class="flex flex-wrap gap-2">
                  {#each pkg.charter.metrics as metric (metric)}
                    <Badge variant="muted">{metric}</Badge>
                  {/each}
                </div>
              {/if}
            </Card>
          {/if}
        </aside>
      </div>
    {/if}
  </DataState>
</section>
