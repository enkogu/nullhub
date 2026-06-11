<script lang="ts">
  import StatusDot, { type StatusDotStatus } from "./StatusDot.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";

  let {
    name,
    status,
    role,
    currentWork,
    dailyCost,
    sourceKit,
    href,
    onOpen,
    class: className,
  }: {
    name: string;
    status?: StatusDotStatus;
    role?: string;
    currentWork?: string;
    dailyCost?: string;
    sourceKit?: string;
    href?: string;
    onOpen?: () => void;
    class?: string;
  } = $props();

  function readableStatus(value: StatusDotStatus | undefined): string {
    if (!value) return "Unknown";
    if (value === "ok") return "OK";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
</script>

<Card class={`agent-card gap-0 overflow-hidden p-0 ${className || ""}`}>
  <div class="border-b px-4 py-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate text-base font-semibold text-foreground">{name}</h3>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusDot status={status || "unknown"} label={readableStatus(status)} size="sm" />
          {#if role}
            <span class="truncate">Role: {role}</span>
          {/if}
        </div>
      </div>
      {#if href}
        <Button href={href} variant="outline" size="sm" class="shrink-0" onclick={onOpen}>
          Open
        </Button>
      {:else if onOpen}
        <Button variant="outline" size="sm" class="shrink-0" onclick={onOpen}>
          Open
        </Button>
      {/if}
    </div>
  </div>

  <div class={`grid gap-4 px-4 py-4 ${dailyCost ? "sm:grid-cols-2" : ""}`}>
    <div class="space-y-1">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current work</p>
      <p class="min-h-10 text-sm leading-5 text-foreground">{currentWork || "Idle"}</p>
    </div>
    {#if dailyCost}
      <div class="space-y-1 sm:text-right">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Daily cost</p>
        <p class="text-sm font-medium text-foreground">{dailyCost}</p>
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap items-center gap-2 border-t px-4 py-3">
    {#if sourceKit}
      <Badge variant="secondary" class="rounded-full px-2.5 py-1 text-xs">
        Kit: {sourceKit}
      </Badge>
    {/if}
    {#if status}
      <Badge variant="outline" class="rounded-full px-2.5 py-1 text-xs">
        {readableStatus(status)}
      </Badge>
    {/if}
  </div>
</Card>
