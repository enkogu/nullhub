<script lang="ts">
  import { api } from "$lib/api/client";
  import UsageOverview, { type UsagePayload, type UsageWindow } from "$lib/components/UsageOverview.svelte";
  import { PageHeader } from "$lib/components/ui/page-header";

  let usageWindow = $state<UsageWindow>("7d");
  let usageData = $state<UsagePayload | null>(null);
  let loading = $state(true);
  let error = $state("");
  let requestSeq = 0;
  let lastLoadKey = "";

  async function loadUsage() {
    const req = ++requestSeq;
    loading = true;
    error = "";
    try {
      const result = await api.getGlobalUsage(usageWindow);
      if (req !== requestSeq) return;
      usageData = result;
    } catch (e) {
      if (req !== requestSeq) return;
      error = (e as Error).message;
      usageData = null;
    } finally {
      if (req === requestSeq) loading = false;
    }
  }

  $effect(() => {
    const key = usageWindow;
    if (key === lastLoadKey) return;
    lastLoadKey = key;
    void loadUsage();
  });
</script>

<div class="space-y-5 p-6">
  <PageHeader
    title="System Usage"
    subtitle="Usage totals from the Hub usage ledger."
  />

  <UsageOverview
    bind:window={usageWindow}
    data={usageData}
    {loading}
    {error}
    spaceLabel="All spaces"
    onRefresh={() => void loadUsage()}
  />
</div>
