<script lang="ts" module>
  import type { DataTableColumn, DataTableRow } from "$lib/components/ui/data-table";

  export type UsageWindow = "24h" | "7d" | "30d" | "all";

  export type UsageTotals = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    requests?: number;
    total_cost_usd?: number;
    cost_usd?: number;
    spend_usd?: number;
    total_spend_usd?: number;
    amount_usd?: number;
  };

  export type UsageModelUsage = UsageTotals & {
    provider?: string;
    model?: string;
    last_used?: number;
  };

  export type UsageInstanceUsage = UsageTotals & {
    component?: string;
    name?: string;
    space_id?: string;
    space?: string;
  };

  export type UsageTimeseriesBucket = UsageTotals & {
    bucket_start?: number;
  };

  export type UsagePayload = {
    window?: UsageWindow | string;
    generated_at?: number;
    totals?: UsageTotals;
    by_model?: UsageModelUsage[];
    by_instance?: UsageInstanceUsage[];
    timeseries?: UsageTimeseriesBucket[];
  };

  type AgentUsageRow = DataTableRow & {
    id: string;
    space: string;
    agent: string;
    period: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    requests: number;
    spend: number | null;
  };

  type ModelUsageRow = DataTableRow & {
    id: string;
    provider: string;
    model: string;
    totalTokens: number;
    requests: number;
    lastUsed: number | null;
  };
</script>

<script lang="ts">
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import EmptyState from "./EmptyState.svelte";
  import ErrorState from "./ErrorState.svelte";
  import StatCard, { type StatCardState } from "./StatCard.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { DataTable } from "$lib/components/ui/data-table";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";

  let {
    data = null,
    loading = false,
    error = "",
    window = $bindable<UsageWindow>("7d"),
    spaceLabel = "All spaces",
    onRefresh,
  }: {
    data?: UsagePayload | null;
    loading?: boolean;
    error?: string;
    window?: UsageWindow;
    spaceLabel?: string;
    onRefresh?: () => void;
  } = $props();

  const agentColumns: DataTableColumn<AgentUsageRow>[] = [
    { key: "space", label: "Space", sortable: true },
    { key: "agent", label: "Agent", sortable: true },
    { key: "period", label: "Period", sortable: true },
    {
      key: "totalTokens",
      label: "Tokens",
      sortable: true,
      align: "end",
      format: (value) => formatInteger(numberValue(value) ?? 0),
    },
    {
      key: "requests",
      label: "Requests",
      sortable: true,
      align: "end",
      format: (value) => formatInteger(numberValue(value) ?? 0),
    },
    {
      key: "spend",
      label: "Spend",
      sortable: true,
      align: "end",
      format: (value) => formatCost(numberValue(value)),
      sortValue: (row) => row.spend ?? -1,
    },
  ];

  const modelColumns: DataTableColumn<ModelUsageRow>[] = [
    { key: "provider", label: "Provider", sortable: true },
    { key: "model", label: "Model", sortable: true },
    {
      key: "totalTokens",
      label: "Tokens",
      sortable: true,
      align: "end",
      format: (value) => formatInteger(numberValue(value) ?? 0),
    },
    {
      key: "requests",
      label: "Requests",
      sortable: true,
      align: "end",
      format: (value) => formatInteger(numberValue(value) ?? 0),
    },
    {
      key: "lastUsed",
      label: "Last used",
      sortable: true,
      format: (value) => formatTimestamp(numberValue(value)),
      sortValue: (row) => row.lastUsed ?? 0,
    },
  ];

  let totals = $derived(data?.totals || {});
  let totalTokens = $derived(numberValue(totals.total_tokens) ?? sumBy(data?.by_instance, "total_tokens"));
  let promptTokens = $derived(numberValue(totals.prompt_tokens) ?? sumBy(data?.by_instance, "prompt_tokens"));
  let completionTokens = $derived(numberValue(totals.completion_tokens) ?? sumBy(data?.by_instance, "completion_tokens"));
  let requests = $derived(numberValue(totals.requests) ?? sumBy(data?.by_instance, "requests"));
  let spend = $derived(costValue(totals) ?? aggregateCost(data?.by_instance) ?? aggregateCost(data?.by_model));
  let agentRows = $derived(agentTableRows(data, window));
  let modelRows = $derived(modelTableRows(data));
  let hasUsage = $derived(totalTokens > 0 || requests > 0 || agentRows.length > 0 || modelRows.length > 0);
  let generatedAt = $derived(formatTimestamp(numberValue(data?.generated_at)));
  let effectiveWindow = $derived(formatWindow(String(data?.window || window)));
  let cardState = $derived((loading ? "loading" : error ? "error" : hasUsage ? "populated" : "empty") as StatCardState);
  let spendState = $derived((loading ? "loading" : error ? "error" : spend === null ? "empty" : "populated") as StatCardState);

  function stringValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  }

  function numberValue(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function sumBy(rows: UsageTotals[] | undefined, key: keyof UsageTotals): number {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((total, row) => total + (numberValue(row[key]) ?? 0), 0);
  }

  function costValue(value: UsageTotals | undefined): number | null {
    if (!value) return null;
    return firstNumber(
      value.total_cost_usd,
      value.cost_usd,
      value.spend_usd,
      value.total_spend_usd,
      value.amount_usd,
    );
  }

  function firstNumber(...values: unknown[]): number | null {
    for (const value of values) {
      const numeric = numberValue(value);
      if (numeric !== null) return numeric;
    }
    return null;
  }

  function aggregateCost(rows: UsageTotals[] | undefined): number | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    let total = 0;
    let found = false;
    for (const row of rows) {
      const value = costValue(row);
      if (value === null) continue;
      total += value;
      found = true;
    }
    return found ? total : null;
  }

  function formatInteger(value: number): string {
    return Math.max(0, value).toLocaleString();
  }

  function formatCost(value: number | null): string {
    if (value === null) return "Not reported";
    if (value === 0) return "$0.0000";
    if (value < 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(2)}`;
  }

  function formatTimestamp(epochSeconds: number | null): string {
    if (!epochSeconds) return "Not reported";
    const date = new Date(epochSeconds * 1000);
    return Number.isNaN(date.getTime()) ? "Not reported" : date.toLocaleString();
  }

  function formatWindow(value: string): string {
    if (value === "24h") return "24h";
    if (value === "7d") return "7d";
    if (value === "30d") return "30d";
    if (value === "all") return "All time";
    return value || "7d";
  }

  function agentLabel(row: UsageInstanceUsage): string {
    const component = stringValue(row.component) || "instance";
    const name = stringValue(row.name) || "unknown";
    return `${component}/${name}`;
  }

  function agentTableRows(payload: UsagePayload | null, selectedWindow: UsageWindow): AgentUsageRow[] {
    return Array.isArray(payload?.by_instance)
      ? payload.by_instance.map((row, index) => ({
          id: `${stringValue(row.component) || "component"}:${stringValue(row.name) || "name"}:${index}`,
          space: stringValue(row.space) || stringValue(row.space_id) || "Not reported",
          agent: agentLabel(row),
          period: formatWindow(String(payload?.window || selectedWindow)),
          totalTokens: numberValue(row.total_tokens) ?? 0,
          promptTokens: numberValue(row.prompt_tokens) ?? 0,
          completionTokens: numberValue(row.completion_tokens) ?? 0,
          requests: numberValue(row.requests) ?? 0,
          spend: costValue(row),
        }))
      : [];
  }

  function modelTableRows(payload: UsagePayload | null): ModelUsageRow[] {
    return Array.isArray(payload?.by_model)
      ? payload.by_model.map((row, index) => ({
          id: `${stringValue(row.provider) || "provider"}:${stringValue(row.model) || "model"}:${index}`,
          provider: stringValue(row.provider) || "unknown",
          model: stringValue(row.model) || "unknown",
          totalTokens: numberValue(row.total_tokens) ?? 0,
          requests: numberValue(row.requests) ?? 0,
          lastUsed: numberValue(row.last_used),
        }))
      : [];
  }
</script>

<section class="space-y-4" data-slot="usage-overview" aria-label="System usage overview">
  <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="muted">{spaceLabel}</Badge>
      <Badge variant="outline">{effectiveWindow}</Badge>
      <span class="text-muted-foreground text-sm">Generated {generatedAt}</span>
    </div>
    <div class="flex flex-wrap items-end gap-2">
      <Label class="flex flex-col items-start gap-1 text-xs font-medium text-muted-foreground">
        Period
        <Select bind:value={window} class="min-w-28">
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="all">All time</option>
        </Select>
      </Label>
      {#if onRefresh}
        <Button variant="outline" size="icon-sm" onclick={onRefresh} disabled={loading} title="Refresh usage" aria-label="Refresh usage">
          <RefreshCwIcon />
        </Button>
      {/if}
    </div>
  </div>

  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <StatCard
      title="Spend"
      value={formatCost(spend)}
      description={spend === null ? "The usage API does not report spend fields yet." : `${formatWindow(window)} reported spend.`}
      state={spendState}
      errorMessage={error || undefined}
    />
    <StatCard
      title="Total tokens"
      value={formatInteger(totalTokens)}
      description={`${formatInteger(promptTokens)} prompt / ${formatInteger(completionTokens)} completion`}
      state={cardState}
      errorMessage={error || undefined}
    />
    <StatCard
      title="Requests"
      value={formatInteger(requests)}
      description={`${formatWindow(window)} model request count`}
      state={cardState}
      errorMessage={error || undefined}
    />
    <StatCard
      title="Agents"
      value={agentRows.length}
      description={agentRows.length === 1 ? "1 agent has usage in this period." : "Agents with usage in this period."}
      state={cardState}
      errorMessage={error || undefined}
    />
  </div>

  {#if error}
    <ErrorState
      title="Usage data could not be loaded"
      message={error}
      retryLabel={onRefresh ? "Retry" : undefined}
      onRetry={onRefresh}
    />
  {:else if !loading && !hasUsage}
    <EmptyState
      title="No usage recorded"
      description="Model usage rows will appear here after agents record token usage in the selected period."
      icon="inbox"
    />
  {/if}

  <div class="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
    <Card class="gap-4 px-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">Usage by agent</h2>
        <p class="text-sm text-muted-foreground">Space, agent, period, tokens, requests, and reported spend.</p>
      </div>
      <DataTable
        caption="Usage by agent"
        columns={agentColumns}
        rows={agentRows}
        rowKey="id"
        loading={loading}
        loadingRows={4}
        emptyTitle="No agent usage"
        emptyDescription="No agent rows were reported for this period."
        initialSort={{ key: "totalTokens", direction: "desc" }}
      />
    </Card>

    <Card class="gap-4 px-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">Usage by model</h2>
        <p class="text-sm text-muted-foreground">Provider/model totals from the same usage payload.</p>
      </div>
      <DataTable
        caption="Usage by model"
        columns={modelColumns}
        rows={modelRows}
        rowKey="id"
        loading={loading}
        loadingRows={4}
        emptyTitle="No model usage"
        emptyDescription="No model rows were reported for this period."
        initialSort={{ key: "totalTokens", direction: "desc" }}
      />
    </Card>
  </div>
</section>
