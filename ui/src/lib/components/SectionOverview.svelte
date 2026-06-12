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
</script>

<script lang="ts">
  import { page } from "$app/stores";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
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
  }: {
    title: string;
    subtitle: string;
    summaries: SectionOverviewSummary[];
    tabs: SectionOverviewTab[];
    primaryHref: string;
    primaryLabel: string;
    defaultTab?: string;
  } = $props();

  let activeTab = $state("");

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

<section class="flex min-w-0 flex-col gap-5" data-slot="section-overview" aria-label={`${title} overview`}>
  <PageHeader {title} {subtitle}>
    {#snippet actions()}
      <Button href={hrefWithSearch(primaryHref)} size="sm">
        {primaryLabel}
        <ArrowRightIcon class="size-4" aria-hidden="true" />
      </Button>
    {/snippet}
  </PageHeader>

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
</section>
