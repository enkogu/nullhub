<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  type ConfigCard = {
    title: string;
    href: string;
    primary: string;
    secondary: string;
    tone: "ok" | "warn" | "neutral";
  };

  let providers = $state<any[]>([]);
  let channels = $state<any[]>([]);
  let providerError = $state("");
  let channelError = $state("");
  let loading = $state(false);
  let loadTimer: ReturnType<typeof setTimeout> | null = null;

  let validProviders = $derived(
    providers.filter((provider) => provider.last_validation_ok || provider.validated_at).length,
  );
  let validChannels = $derived(
    channels.filter((channel) => channel.last_validation_ok || channel.validated_at).length,
  );
  let cards = $derived<ConfigCard[]>([
    {
      title: "Providers",
      href: "/providers",
      primary: `${providers.length} saved`,
      secondary: providerError || `${validProviders} validated`,
      tone: providerError ? "warn" : providers.length > 0 ? "ok" : "neutral",
    },
    {
      title: "Channels",
      href: "/channels",
      primary: `${channels.length} saved`,
      secondary: channelError || `${validChannels} validated`,
      tone: channelError ? "warn" : channels.length > 0 ? "ok" : "neutral",
    },
  ]);
  const configColumns: EntityColumn[] = [
    { id: "saved", label: "Saved", type: "number", width: "minmax(110px,.35fr)" },
    { id: "validated", label: "Validated", type: "number", width: "minmax(120px,.38fr)" },
    { id: "status", label: "Status", type: "status", width: "minmax(120px,.38fr)" },
    { id: "detail", label: "Detail", type: "text", width: "minmax(220px,1fr)" },
  ];
  const configViews = createViewSet({
    kanban: { groupBy: "status" },
    tree: { parentField: "status" },
  });
  const configActions: EntityViewAction[] = [
    { id: "open", label: "Open", variant: "default", href: (record) => record.href || "#" },
  ];
  let configRecords = $derived(
    cards.map((card) => {
      const saved = Number(card.primary.match(/\d+/)?.[0] || 0);
      const validated = Number(card.secondary.match(/\d+/)?.[0] || 0);
      const status = card.tone === "warn" ? "failed" : card.tone === "ok" ? "active" : "pending";
      return {
        id: `config:${card.title.toLowerCase()}`,
        title: card.title,
        type: "config",
        status,
        subtitle: loading ? "Loading" : card.primary,
        description: loading ? "-" : card.secondary,
        href: card.href,
        fields: {
          saved,
          validated,
          status,
          detail: loading ? "-" : card.secondary,
        },
        raw: card,
      };
    }) satisfies EntityRecord[],
  );

  onMount(() => {
    loadTimer = setTimeout(async () => {
      loading = true;
      await Promise.all([loadProviders(), loadChannels()]);
      loading = false;
    }, 350);
  });

  onDestroy(() => {
    if (loadTimer) clearTimeout(loadTimer);
  });

  async function loadProviders() {
    providerError = "";
    try {
      const data = await api.getSavedProviders();
      providers = data.providers || [];
    } catch (e) {
      providerError = (e as Error).message;
    }
  }

  async function loadChannels() {
    channelError = "";
    try {
      const data = await api.getSavedChannels();
      channels = data.channels || [];
    } catch (e) {
      channelError = (e as Error).message;
    }
  }
</script>

<div class="configs-page" aria-busy={loading}>
  <div class="page-header">
    <h1>Configs</h1>
  </div>

  <UniversalEntityView
    title="Config Sections"
    description="Saved provider and channel configuration areas with validation coverage."
    records={configRecords}
    columns={configColumns}
    views={configViews}
    defaultViewId="cards"
    {loading}
    actions={configActions}
    emptyTitle="No config sections"
    emptyDescription="Configuration sections are unavailable."
    onRefresh={async () => {
      loading = true;
      await Promise.all([loadProviders(), loadChannels()]);
      loading = false;
    }}
  />
</div>

<style>
  .configs-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0 auto;
    max-width: 1120px;
    padding: 1.5rem;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h1 {
    color: var(--shadcn-foreground);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  @media (max-width: 760px) {
    .configs-page {
      padding: 1rem;
    }
  }
</style>
