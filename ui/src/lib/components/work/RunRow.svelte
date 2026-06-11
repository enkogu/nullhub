<script lang="ts">
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import BotIcon from '@lucide/svelte/icons/bot';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import StatusDot, { type StatusDotStatus } from '$lib/components/StatusDot.svelte';
  import { cn } from '$lib/utils.js';
  import {
    formatLiveDuration,
    formatLiveTime,
    liveLabel,
    type LiveRun,
    type LiveRunBucket,
    type LiveRunSource,
    type LiveWatchState,
  } from './live';

  let {
    run,
    nowMs = Date.now(),
    class: className,
  }: {
    run: LiveRun;
    nowMs?: number;
    class?: string;
  } = $props();

  let sourceLabel = $derived(sourceDisplay(run.source));
  let bucketLabel = $derived(liveLabel(run.bucket));
  let updatedLabel = $derived(formatLiveTime(run.updatedAtMs || run.startedAtMs, nowMs));
  let absoluteTime = $derived(run.updatedAtMs ? new Date(run.updatedAtMs).toISOString() : undefined);
  let durationLabel = $derived(formatLiveDuration(run.durationMs));

  function sourceDisplay(source: LiveRunSource): string {
    if (source === 'loop') return 'Loop run';
    if (source === 'workflow') return 'Workflow run';
    return 'Agent task';
  }

  function bucketStatus(bucket: LiveRunBucket): StatusDotStatus {
    if (bucket === 'completed') return 'ok';
    if (bucket === 'active') return 'running';
    if (bucket === 'stalled') return 'failed';
    if (bucket === 'attention') return 'risk';
    return 'muted';
  }

  function bucketVariant(bucket: LiveRunBucket): BadgeVariant {
    if (bucket === 'completed') return 'success';
    if (bucket === 'active') return 'secondary';
    if (bucket === 'stalled' || bucket === 'attention') return 'destructive';
    return 'muted';
  }

  function sourceVariant(source: LiveRunSource): BadgeVariant {
    if (source === 'loop') return 'outline';
    if (source === 'workflow') return 'secondary';
    return 'muted';
  }

  function watchLabel(state: LiveWatchState): string {
    if (state === 'observed') return 'Watch observed';
    if (state === 'unobserved') return 'Watch not seen';
    return 'Watch unavailable';
  }
</script>

<article
  data-slot="run-row"
  class={cn('rounded-lg border bg-card p-4 text-card-foreground shadow-sm', run.stalled && 'border-destructive/40', className)}
  aria-label={`${run.title} ${sourceLabel}`}
>
  <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
    <div class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <StatusDot status={bucketStatus(run.bucket)} label={bucketLabel} size="sm" />
        <Badge variant={sourceVariant(run.source)}>{sourceLabel}</Badge>
        <Badge variant={bucketVariant(run.bucket)}>{run.status}</Badge>
        <Badge variant="outline">{run.surfaceLabel}</Badge>
      </div>
      <div class="min-w-0">
        <h3 class="truncate text-sm font-semibold">{run.title}</h3>
        <p class="mt-1 text-sm leading-6 text-muted-foreground">{run.summary}</p>
      </div>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <time class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" datetime={absoluteTime}>
        <ClockIcon class="size-3.5" aria-hidden="true" />
        {updatedLabel}
      </time>
      {#if run.href}
        <Button href={run.href} variant="ghost" size="icon-sm" aria-label={`Open ${run.title}`}>
          <ExternalLinkIcon class="size-4" aria-hidden="true" />
        </Button>
      {/if}
    </div>
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
      <BotIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{run.ownerLabel}: {run.owner}</span>
    </span>
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
      <ActivityIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{watchLabel(run.watchState)}</span>
    </span>
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
      <ClockIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">Duration {durationLabel}</span>
    </span>
    {#if run.attempt}
      <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
        <ActivityIcon class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">Attempt {run.attempt}</span>
      </span>
    {/if}
    {#if run.evidenceRef}
      <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
        <ActivityIcon class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{run.evidenceRef}</span>
      </span>
    {/if}
  </div>

  {#if run.stallReason}
    <p class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {run.stallReason}
    </p>
  {/if}
</article>
