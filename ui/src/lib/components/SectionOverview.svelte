<script lang="ts" module>
  export type SectionOverviewLink = {
    label: string;
    href: string;
    description: string;
    status?: string;
  };

  export type SectionOverviewSummary = {
    label: string;
    value: string;
    description: string;
  };

  export type SectionOverviewTab = {
    value: string;
    label: string;
    description: string;
    links: SectionOverviewLink[];
  };

  export type SectionOverviewState = "loading" | "empty" | "error" | "populated";
</script>

<script lang="ts">
  import { page } from "$app/stores";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import DataState from "./DataState.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "$lib/components/ui/tabs";

  let {
    title,
    subtitle,
    summaries,
    tabs,
    primaryHref,
    primaryLabel,
    defaultTab = tabs[0]?.value ?? "",
    state: overviewState,
    error,
    loadingTitle,
    loadingDescription = "Fetching the latest section data.",
    emptyTitle,
    emptyDescription = "Section panels will appear here once they are available.",
    emptyActionLabel,
    emptyActionHref,
    errorTitle,
    errorMessage,
    errorDetails,
    retryLabel,
    retryHref,
    onRetry,
  }: {
    title: string;
    subtitle: string;
    summaries: SectionOverviewSummary[];
    tabs: SectionOverviewTab[];
    primaryHref: string;
    primaryLabel: string;
    defaultTab?: string;
    state?: SectionOverviewState;
    error?: unknown;
    loadingTitle?: string;
    loadingDescription?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyActionLabel?: string;
    emptyActionHref?: string;
    errorTitle?: string;
    errorMessage?: string;
    errorDetails?: string;
    retryLabel?: string;
    retryHref?: string;
    onRetry?: () => void;
  } = $props();

  let activeTab = $state("");
  let resolvedState = $derived(overviewState ?? (summaries.length === 0 || tabs.length === 0 ? "empty" : "populated"));
  let resolvedLoadingTitle = $derived(loadingTitle ?? `Loading ${title}`);
  let resolvedEmptyTitle = $derived(emptyTitle ?? `No ${title.toLowerCase()} panels`);
  let resolvedErrorTitle = $derived(errorTitle ?? `Unable to load ${title.toLowerCase()}`);

  $effect(() => {
    if (activeTab) return;
    activeTab = defaultTab;
  });

  function hrefWithSearch(href: string): string {
    const search = $page?.url?.search ?? "";
    if (!search) return href;
    if (href.includes("?")) return `${href}&${search.slice(1)}`;
    return `${href}${search}`;
  }
</script>

<section
  class="flex min-w-0 flex-col gap-5"
  data-slot="section-overview"
  aria-label={`${title} overview`}
  aria-busy={resolvedState === "loading"}
>
  <PageHeader {title} {subtitle}>
    {#snippet actions()}
      <Button href={hrefWithSearch(primaryHref)} size="sm">
        {primaryLabel}
        <ArrowRightIcon class="size-4" aria-hidden="true" />
      </Button>
    {/snippet}
  </PageHeader>

  <DataState
    state={resolvedState}
    {error}
    loadingTitle={resolvedLoadingTitle}
    {loadingDescription}
    emptyTitle={resolvedEmptyTitle}
    {emptyDescription}
    {emptyActionLabel}
    emptyActionHref={emptyActionHref ? hrefWithSearch(emptyActionHref) : undefined}
    errorTitle={resolvedErrorTitle}
    {errorMessage}
    {errorDetails}
    {retryLabel}
    retryHref={retryHref ? hrefWithSearch(retryHref) : undefined}
    {onRetry}
  >
    <div class="flex min-w-0 flex-col gap-5" data-slot="section-overview-populated">
      <div class="grid gap-3 md:grid-cols-3" aria-label={`${title} summary`}>
        {#each summaries as item (item.label)}
          <Card class="gap-3 px-5">
            <p class="text-muted-foreground text-sm font-medium">{item.label}</p>
            <p class="text-foreground text-2xl font-semibold">{item.value}</p>
            <p class="text-muted-foreground text-sm leading-5">{item.description}</p>
          </Card>
        {/each}
      </div>

      <Tabs bind:value={activeTab} class="gap-4">
        <TabsList>
          {#each tabs as tab (tab.value)}
            <TabsTrigger value={tab.value}>{tab.label}</TabsTrigger>
          {/each}
        </TabsList>

        {#each tabs as tab (tab.value)}
          <TabsContent value={tab.value}>
            <div class="grid gap-3 lg:grid-cols-2">
              <Card class="gap-3 px-5 lg:col-span-2">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 space-y-1">
                    <h2 class="text-foreground text-lg font-semibold">{tab.label}</h2>
                    <p class="text-muted-foreground text-sm leading-5">{tab.description}</p>
                  </div>
                  <Badge variant="outline">{tab.links.length} panels</Badge>
                </div>
              </Card>

              {#each tab.links as link (link.href)}
                <Card class="gap-4 px-5">
                  <div class="flex min-w-0 items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <h3 class="text-foreground text-base font-semibold">{link.label}</h3>
                      <p class="text-muted-foreground text-sm leading-5">{link.description}</p>
                    </div>
                    {#if link.status}
                      <Badge variant="secondary">{link.status}</Badge>
                    {/if}
                  </div>
                  <div>
                    <Button href={hrefWithSearch(link.href)} variant="outline" size="sm">
                      Open
                      <ArrowRightIcon class="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              {/each}
            </div>
          </TabsContent>
        {/each}
      </Tabs>
    </div>
  </DataState>
</section>
