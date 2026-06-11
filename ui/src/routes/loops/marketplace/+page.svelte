<script lang="ts">
  import { onMount } from "svelte";
  import { api, nullTicketsStoreApi } from "$lib/api/client";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { getSelectedTicketsInstance } from "$lib/nullstack/backendSelection";
  import {
    LOOP_MARKETPLACE_NAMESPACE,
    normalizeLoopTemplate,
    storeEntryHasInlineValue,
    storeEntryKey,
    storeEntryValue,
  } from "$lib/loops/marketplace";
  import { installedTemplateSlugs, templateDefinition } from "$lib/loops/templates";
  import type { LoopPipeline } from "$lib/loops/types";
  import type { LoopTemplate } from "$lib/loops/templates";

  const ticketsComponent = "nulltickets";

  let status = $state<any>(null);
  let templates = $state<LoopTemplate[]>([]);
  let installedSlugs = $state<Set<string>>(new Set());
  let loading = $state(true);
  let error = $state<unknown>(null);
  let installError = $state("");
  let message = $state("");
  let installingSlug = $state("");

  const marketState = $derived<DataStateKind>(
    error ? "error" : loading ? "loading" : templates.length === 0 ? "empty" : "populated",
  );
  const libraryHref = $derived(`/orders/loops/library?tickets_instance=${encodeURIComponent(ticketsInstance())}`);

  function statusTicketsInstance(): string {
    const instances = status?.instances?.nulltickets || {};
    const entry = Object.entries(instances)[0] as [string, any] | undefined;
    return entry?.[0] || "";
  }

  function ticketsInstance(): string {
    return getSelectedTicketsInstance() || statusTicketsInstance() || "tickets";
  }

  function pipelinesFrom(result: any): LoopPipeline[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.pipelines)) return result.pipelines;
    if (Array.isArray(result?.items)) return result.items;
    return [];
  }

  function catalogEntriesFrom(result: any): unknown[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.templates)) return result.templates;
    if (Array.isArray(result?.items)) return result.items;
    if (Array.isArray(result?.entries)) return result.entries;
    return [];
  }

  async function resolveCatalogEntry(entry: unknown, index: number, target: string): Promise<LoopTemplate | null> {
    const key = storeEntryKey(entry, index);
    const raw = storeEntryHasInlineValue(entry)
      ? storeEntryValue(entry)
      : storeEntryValue(await nullTicketsStoreApi.storeGet(LOOP_MARKETPLACE_NAMESPACE, key, target));
    return normalizeLoopTemplate(raw, key);
  }

  async function loadInstalledSlugs(target = ticketsInstance()) {
    const result = await api.nullTicketsPipelines(ticketsComponent, target);
    installedSlugs = installedTemplateSlugs(pipelinesFrom(result));
  }

  async function loadMarketplace() {
    loading = true;
    error = null;
    installError = "";
    try {
      status = await api.getStatus();
      const target = ticketsInstance();
      const [catalogResult] = await Promise.all([
        nullTicketsStoreApi.storeList(LOOP_MARKETPLACE_NAMESPACE, target),
        loadInstalledSlugs(target),
      ]);
      const entries = catalogEntriesFrom(catalogResult);
      const resolved = await Promise.all((entries || []).map((entry, index) => resolveCatalogEntry(entry, index, target)));
      templates = resolved.filter((template): template is LoopTemplate => Boolean(template));
    } catch (e) {
      error = e;
      templates = [];
      installedSlugs = new Set();
    } finally {
      loading = false;
    }
  }

  function isInstalled(template: LoopTemplate): boolean {
    return installedSlugs.has(template.slug);
  }

  async function installTemplate(template: LoopTemplate) {
    installingSlug = template.slug;
    installError = "";
    message = "";
    const target = ticketsInstance();
    try {
      await api.nullTicketsCreatePipeline(ticketsComponent, target, {
        name: template.slug,
        definition: templateDefinition(template),
      });
      await loadInstalledSlugs(target);
      installedSlugs = new Set([...installedSlugs, template.slug]);
      message = `${template.name} installed into Library.`;
    } catch (e) {
      installError = (e as Error).message || "Unable to install this loop template.";
    } finally {
      installingSlug = "";
    }
  }

  onMount(() => {
    void loadMarketplace();
  });
</script>

<div class="marketplace-page">
  <PageHeader
    title="Loop Marketplace"
    subtitle="Browse remote loop templates and install them into the local Library."
    align="start"
  >
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => void loadMarketplace()} disabled={loading}>
        {loading ? "Refreshing" : "Refresh"}
      </Button>
      <Button href={libraryHref} size="sm">Open Library</Button>
    {/snippet}
  </PageHeader>

  {#if installError}
    <div class="alert alert-error" role="alert">{installError}</div>
  {/if}
  {#if message}
    <div class="alert alert-success" role="status">{message}</div>
  {/if}

  <DataState
    state={marketState}
    {error}
    loadingTitle="Loading loop marketplace"
    loadingDescription="Fetching remote loop templates from the selected NullTickets catalog."
    emptyTitle="No remote loop templates"
    emptyDescription="The selected catalog is connected but does not contain installable loop templates yet."
    emptyActionLabel="Open Library"
    emptyActionHref={libraryHref}
    errorTitle="Unable to load loop marketplace"
    retryLabel="Retry"
    onRetry={() => void loadMarketplace()}
  >
    <div class="template-grid">
      {#each templates as template (template.slug)}
        <Card class="template-card">
          <div class="template-head">
            <div class="template-title">
              <h2>{template.name}</h2>
              <p>{template.tagline}</p>
            </div>
            <Badge variant="muted">{template.category}</Badge>
          </div>

          <dl class="template-facts">
            <div>
              <dt>Machine</dt>
              <dd>{template.machine}</dd>
            </div>
            <div>
              <dt>Exit condition</dt>
              <dd>{template.exitCondition}</dd>
            </div>
            <div>
              <dt>Max iterations</dt>
              <dd>{template.maxIterations}</dd>
            </div>
          </dl>

          <div class="template-actions">
            {#if isInstalled(template)}
              <Badge variant="success">installed</Badge>
            {:else}
              <Button
                size="sm"
                onclick={() => void installTemplate(template)}
                disabled={installingSlug === template.slug}
              >
                {installingSlug === template.slug ? "Installing" : "Install"}
              </Button>
            {/if}
          </div>
        </Card>
      {/each}
    </div>
  </DataState>
</div>

<style>
  .marketplace-page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

  .alert {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
  }

  .alert-error {
    border-color: color-mix(in oklch, var(--shadcn-destructive) 45%, var(--shadcn-border));
    color: var(--shadcn-destructive);
  }

  .alert-success {
    border-color: color-mix(in oklch, var(--shadcn-primary) 35%, var(--shadcn-border));
    color: var(--shadcn-foreground);
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: 0.75rem;
  }

  :global(.template-card) {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
  }

  .template-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .template-title {
    min-width: 0;
  }

  .template-title h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .template-title p {
    margin: 0.35rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .template-facts {
    display: grid;
    gap: 0.4rem;
    margin: 0;
  }

  .template-facts div {
    display: grid;
    grid-template-columns: minmax(7rem, 0.45fr) minmax(0, 1fr);
    gap: 0.75rem;
    font-size: 0.8125rem;
  }

  .template-facts dt {
    color: var(--shadcn-muted-foreground);
  }

  .template-facts dd {
    min-width: 0;
    margin: 0;
  }

  .template-actions {
    display: flex;
    margin-top: auto;
    justify-content: flex-end;
  }

</style>
