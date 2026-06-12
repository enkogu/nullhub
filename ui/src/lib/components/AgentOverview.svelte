<script lang="ts" module>
  import type { StatusDotStatus } from "./StatusDot.svelte";
  import type { DataTableColumn, DataTableRow } from "$lib/components/ui/data-table";

  export type AgentProviderStatus = {
    provider?: string;
    model?: string;
    configured?: boolean;
  };

  export type AgentUsageRow = {
    provider?: string;
    model?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    requests?: number;
    last_used?: number;
    total_cost_usd?: number;
    cost_usd?: number;
    spend_usd?: number;
  };

  export type AgentUsagePayload = {
    rows?: AgentUsageRow[];
    totals?: Record<string, unknown>;
  };

  type Metric = {
    value: string | number;
    description?: string;
    empty?: boolean;
  };

  type UsageModelRow = DataTableRow & {
    provider: string;
    model: string;
    totalTokens: number;
    requests: number;
    lastUsed: number | null;
  };
</script>

<script lang="ts">
  import { Badge, type BadgeVariant } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { DataTable } from "$lib/components/ui/data-table";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import StatCard from "./StatCard.svelte";
  import StatusDot from "./StatusDot.svelte";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  let {
    name,
    component = "nullclaw",
    instance = null,
    modelName = "",
    providerStatus = {},
    providerHealth = null,
    providerHealthLoading = false,
    providerHintText = "",
    providerOk = false,
    usageData = null,
    usageLoading = false,
    usageError = "",
    onRefreshUsage,
    onToggleAutoStart,
    onToggleVerbose,
  }: {
    name: string;
    component?: string;
    instance?: Record<string, any> | null;
    modelName?: string | null;
    providerStatus?: AgentProviderStatus;
    providerHealth?: Record<string, any> | null;
    providerHealthLoading?: boolean;
    providerHintText?: string;
    providerOk?: boolean;
    usageData?: AgentUsagePayload | null;
    usageLoading?: boolean;
    usageError?: string;
    onRefreshUsage?: () => void;
    onToggleAutoStart?: () => void;
    onToggleVerbose?: () => void;
  } = $props();

  const usageColumns: DataTableColumn<UsageModelRow>[] = [
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

  let statusValue = $derived(stringValue(instance?.status) || "stopped");
  let statusTone = $derived(statusToTone(statusValue));
  let statusVariant = $derived(statusToBadge(statusValue));
  let runtimeMode = $derived(displayLaunchMode(stringValue(instance?.launch_mode), component));
  let uptimeLabel = $derived(formatUptime(numberValue(instance?.uptime_seconds)));
  let runtimePortLabel = $derived(component === "nullclaw" ? "Gateway port" : "API port");
  let modelLabel = $derived(
    stringValue(modelName) ||
      stringValue(providerStatus?.model) ||
      firstText(instance?.model, instance?.metadata?.model) ||
      "Not configured",
  );
  let providerLabel = $derived(stringValue(providerStatus?.provider) || "No provider");
  let currentRuns = $derived(currentRunsMetric(instance));
  let ordersAsExecutor = $derived(ordersAsExecutorMetric(instance));
  let sevenDayCost = $derived(costMetric(usageData));
  let usageRows = $derived(modelRows(usageData));
  let usageTokens = $derived(numberValue(usageData?.totals?.total_tokens));
  let usageRequests = $derived(numberValue(usageData?.totals?.requests));
  let health = $derived(
    healthMetric(statusValue, providerStatus, providerHealth, providerHealthLoading, providerOk, providerHintText),
  );

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

  function firstText(...values: unknown[]): string {
    for (const value of values) {
      const text = stringValue(value);
      if (text) return text;
    }
    return "";
  }

  function firstNumber(...values: unknown[]): number | null {
    for (const value of values) {
      const numeric = numberValue(value);
      if (numeric !== null) return numeric;
    }
    return null;
  }

  function countFrom(value: unknown): number | null {
    if (Array.isArray(value)) return value.length;
    return numberValue(value);
  }

  function statusToTone(status: string): StatusDotStatus {
    const normalized = status.toLowerCase();
    if (normalized === "running") return "running";
    if (normalized === "starting" || normalized === "restarting" || normalized === "stopping") return "starting";
    if (normalized === "failed") return "failed";
    if (normalized === "stopped") return "stopped";
    return "unknown";
  }

  function statusToBadge(status: string): BadgeVariant {
    const normalized = status.toLowerCase();
    if (normalized === "running") return "success";
    if (normalized === "starting" || normalized === "restarting" || normalized === "stopping") return "warning";
    if (normalized === "failed") return "destructive";
    return "muted";
  }

  function displayLaunchMode(launchMode: string, componentName: string): string {
    const mode = launchMode || (componentName === "nullclaw" ? "gateway" : "server");
    if (mode === "agent") return "Agent";
    if (mode === "gateway") return "Gateway";
    if (mode === "server" || mode === "serve") return "Server";
    return mode;
  }

  function formatInteger(value: number): string {
    return Math.max(0, value).toLocaleString();
  }

  function formatUptime(seconds: number | null): string {
    if (seconds === null) return "Not reported";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
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

  function currentRunsMetric(source: Record<string, any> | null): Metric {
    const count =
      countFrom(source?.current_runs) ??
      countFrom(source?.active_runs) ??
      countFrom(source?.running_runs) ??
      countFrom(source?.metadata?.current_runs) ??
      countFrom(source?.metadata?.active_runs);
    if (count !== null) {
      return {
        value: count,
        description: count === 1 ? "1 current run reported by the status payload." : "Current runs reported by the status payload.",
      };
    }

    const currentWork = firstText(
      source?.current_work,
      source?.currentWork,
      source?.current_task,
      source?.currentTask,
      source?.current_loop,
      source?.currentLoop,
      source?.active_loop,
      source?.activeLoop,
      source?.metadata?.current_work,
      source?.metadata?.currentWork,
      source?.metadata?.current_task,
      source?.metadata?.currentTask,
      source?.metadata?.current_loop,
      source?.metadata?.currentLoop,
      source?.metadata?.active_loop,
      source?.metadata?.activeLoop,
    );
    if (currentWork && currentWork.toLowerCase() !== "idle") {
      return { value: "Active", description: currentWork };
    }

    return { value: "Not reported", description: "No current run field is present on this agent.", empty: true };
  }

  function ordersAsExecutorMetric(source: Record<string, any> | null): Metric {
    const count =
      countFrom(source?.orders_as_executor) ??
      countFrom(source?.ordersAsExecutor) ??
      countFrom(source?.executor_orders) ??
      countFrom(source?.executorOrders) ??
      countFrom(source?.metadata?.orders_as_executor) ??
      countFrom(source?.metadata?.ordersAsExecutor) ??
      countFrom(source?.metadata?.executor_orders);
    if (count !== null) {
      return {
        value: count,
        description: count === 1 ? "1 order names this agent as executor." : "Orders naming this agent as executor.",
      };
    }
    return {
      value: "Not reported",
      description: "Executor-order counts are not present in the status payload yet.",
      empty: true,
    };
  }

  function costMetric(usage: AgentUsagePayload | null): Metric {
    const totals = usage?.totals || {};
    const direct =
      firstNumber(
        totals.total_cost_usd,
        totals.cost_usd,
        totals.spend_usd,
        totals.total_spend_usd,
        totals.amount_usd,
      ) ??
      aggregateUsageCost(usage?.rows);
    const tokens = numberValue(totals.total_tokens);
    const requests = numberValue(totals.requests);
    if (direct === null) {
      const evidence = [
        tokens !== null ? `${formatInteger(tokens)} tokens` : "",
        requests !== null ? `${formatInteger(requests)} requests` : "",
      ].filter(Boolean);
      return {
        value: "Not reported",
        description: evidence.length > 0 ? `Usage exists (${evidence.join(", ")}), but no cost field is reported.` : "No 7d cost field is reported by usage data.",
        empty: true,
      };
    }
    return {
      value: formatCost(direct),
      description: requests !== null ? `${formatInteger(requests)} request(s) in the 7d usage window.` : "7d usage cost.",
    };
  }

  function aggregateUsageCost(rows: AgentUsageRow[] | undefined): number | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    let total = 0;
    let found = false;
    for (const row of rows) {
      const value = firstNumber(row.total_cost_usd, row.cost_usd, row.spend_usd);
      if (value === null) continue;
      total += value;
      found = true;
    }
    return found ? total : null;
  }

  function modelRows(usage: AgentUsagePayload | null): UsageModelRow[] {
    return Array.isArray(usage?.rows)
      ? usage.rows.map((row, index) => ({
          id: `${stringValue(row.provider) || "provider"}:${stringValue(row.model) || "model"}:${index}`,
          provider: stringValue(row.provider) || "unknown",
          model: stringValue(row.model) || "unknown",
          totalTokens: numberValue(row.total_tokens) ?? 0,
          requests: numberValue(row.requests) ?? 0,
          lastUsed: numberValue(row.last_used),
        }))
      : [];
  }

  function healthMetric(
    status: string,
    provider: AgentProviderStatus,
    healthPayload: Record<string, any> | null,
    checking: boolean,
    liveOk: boolean,
    hint: string,
  ): { tone: StatusDotStatus; label: string; description: string } {
    if (checking) {
      return { tone: "watch", label: "Checking", description: "Provider health probe is running." };
    }
    if (status.toLowerCase() === "failed") {
      return { tone: "failed", label: "Failed", description: "The agent instance is reporting a failed state." };
    }
    if (!provider?.provider) {
      return { tone: "risk", label: "Provider missing", description: "No model provider is configured for this agent." };
    }
    if (healthPayload && liveOk) {
      return { tone: "ok", label: "Healthy", description: "Provider probe passed for the configured model." };
    }
    if (healthPayload && !liveOk) {
      return {
        tone: "risk",
        label: "Needs attention",
        description: hint || "Provider probe did not pass.",
      };
    }
    if (provider.configured) {
      return { tone: "ok", label: "Configured", description: "Provider credentials are present. Live probe has not run yet." };
    }
    return { tone: "risk", label: "Needs setup", description: hint || "Provider credentials are missing." };
  }
</script>

<section class="space-y-4" data-slot="agent-overview" aria-label={`${name} overview`}>
  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <StatCard
      title="Model"
      value={modelLabel}
      description={providerLabel}
      state={modelLabel === "Not configured" ? "empty" : "populated"}
    />
    <StatCard
      title="Current runs"
      value={currentRuns.value}
      description={currentRuns.description}
      state={currentRuns.empty ? "empty" : "populated"}
    />
    <StatCard
      title="Orders as executor"
      value={ordersAsExecutor.value}
      description={ordersAsExecutor.description}
      state={ordersAsExecutor.empty ? "empty" : "populated"}
    />
    <StatCard
      title="7d cost"
      value={sevenDayCost.value}
      description={sevenDayCost.description}
      state={usageLoading ? "loading" : usageError ? "error" : sevenDayCost.empty ? "empty" : "populated"}
      errorMessage={usageError || undefined}
    />
  </div>

  <div class="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
    <Card class="gap-4 px-5">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <h2 class="text-base font-semibold text-foreground">Health</h2>
          <p class="text-sm text-muted-foreground">{health.description}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant}>{statusValue}</Badge>
          <StatusDot status={health.tone} label={health.label} />
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-md border bg-background p-3">
          <p class="text-xs font-medium text-muted-foreground">Runtime</p>
          <p class="mt-1 text-sm font-medium text-foreground">{runtimeMode}</p>
        </div>
        <div class="rounded-md border bg-background p-3">
          <p class="text-xs font-medium text-muted-foreground">Uptime</p>
          <p class="mt-1 text-sm font-medium text-foreground">{uptimeLabel}</p>
        </div>
        {#if instance?.port}
          <div class="rounded-md border bg-background p-3">
            <p class="text-xs font-medium text-muted-foreground">{runtimePortLabel}</p>
            <p class="mt-1 font-mono text-sm font-medium text-foreground">{instance.port}</p>
          </div>
        {/if}
        {#if instance?.pid}
          <div class="rounded-md border bg-background p-3">
            <p class="text-xs font-medium text-muted-foreground">PID</p>
            <p class="mt-1 font-mono text-sm font-medium text-foreground">{instance.pid}</p>
          </div>
        {/if}
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        {#if onToggleAutoStart}
          <Label class="flex min-h-12 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <span class="text-sm font-medium text-foreground">Auto start</span>
            <Switch checked={Boolean(instance?.auto_start)} onclick={onToggleAutoStart} />
          </Label>
        {/if}
        {#if onToggleVerbose}
          <Label class="flex min-h-12 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <span class="text-sm font-medium text-foreground">Verbose startup</span>
            <Switch checked={Boolean(instance?.verbose)} onclick={onToggleVerbose} />
          </Label>
        {/if}
      </div>
    </Card>

    <Card class="gap-4 px-5">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <h2 class="text-base font-semibold text-foreground">7d usage by model</h2>
          <p class="text-sm text-muted-foreground">
            {#if usageTokens !== null || usageRequests !== null}
              {[usageTokens !== null ? `${formatInteger(usageTokens)} tokens` : "", usageRequests !== null ? `${formatInteger(usageRequests)} requests` : ""].filter(Boolean).join(" · ")}
            {:else}
              Usage appears after the agent records model calls.
            {/if}
          </p>
        </div>
        {#if onRefreshUsage}
          <Button
            variant="outline"
            size="icon-sm"
            onclick={onRefreshUsage}
            disabled={usageLoading}
            title="Refresh usage"
            aria-label="Refresh usage"
          >
            <RefreshCwIcon />
          </Button>
        {/if}
      </div>
      <DataTable
        caption="7d model usage"
        columns={usageColumns}
        rows={usageRows}
        rowKey="id"
        loading={usageLoading}
        loadingRows={3}
        emptyTitle="No 7d usage"
        emptyDescription="Model usage rows will appear after requests are recorded."
        initialSort={{ key: "totalTokens", direction: "desc" }}
      />
    </Card>
  </div>
</section>
